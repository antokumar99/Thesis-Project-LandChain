/**
 * Full-flow smoke test against an in-memory MongoDB:
 * user registration → land request → authority approval → listing →
 * buyer challenge → seller ZK proof → buyer verification → purchase →
 * post-transfer security checks.
 *
 * Run: npm run smoke   (from apps/server)
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as auth from "../services/auth.service";
import * as landService from "../services/land.service";
import * as proofService from "../services/proof.service";
import * as challengeService from "../services/challenge.service";
import * as transferService from "../services/transfer.service";
import { UserModel } from "../models/User.model";
import { PROOF_TYPES } from "../constants/proofTypes";

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exit(1);
  }
  console.log(`PASS  ${label}`);
}

async function expectError(promise: Promise<unknown>, label: string): Promise<void> {
  try {
    await promise;
    console.error(`FAIL  ${label} (no error thrown)`);
    process.exit(1);
  } catch {
    console.log(`PASS  ${label}`);
  }
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongod.getUri("landchain-smoke"));

  await auth.seedAuthority();
  const authority = await UserModel.findOne({ role: "AUTHORITY" });
  assert(authority, "fixed authority seeded from env");

  const alice = await auth.registerUser({
    name: "Alice Rahman",
    email: "alice@example.com",
    password: "password-alice",
    walletAddress: "0x00000000000000000000000000000000000000a1",
    nid: "1990123456789",
    phone: "01700000001"
  });
  const bob = await auth.registerUser({
    name: "Bob Karim",
    email: "bob@example.com",
    password: "password-bob",
    walletAddress: "0x00000000000000000000000000000000000000b2",
    nid: "1985987654321"
  });
  type SmokeUser = { id: string; role: string; walletAddress: string };
  const aliceU = alice.user as SmokeUser;
  const bobU = bob.user as SmokeUser;
  assert(aliceU.role === "USER" && bobU.role === "USER", "public registration always creates USER role");

  await expectError(
    auth.registerUser({
      name: "Mallory",
      email: process.env.AUTHORITY_EMAIL ?? "authority@landchain.gov",
      password: "password-mallory",
      walletAddress: "0x00000000000000000000000000000000000000c3",
      nid: "111"
    }),
    "authority email cannot be taken by public registration"
  );

  const aliceSecret = "alice-super-secret-1";
  const land = await landService.requestLandRegistration({
    landId: "LAND-2026-001",
    plotNumber: "PLOT-9",
    location: "Dhanmondi, Dhaka",
    areaSqm: 4500,
    ownerSecret: aliceSecret,
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string
  });
  assert(land.status === "PENDING_APPROVAL", "land request starts pending approval");

  const pending = await landService.listPendingRequests();
  const applicant = pending[0]?.ownerId as unknown as { name?: string; nidHash?: string };
  assert(applicant?.name === "Alice Rahman" && applicant?.nidHash, "authority sees applicant identity on request");

  await landService.approveLand({ landId: "LAND-2026-001", authorityId: String(authority!._id) });
  const approved = await landService.getLand("LAND-2026-001");
  assert(approved.status === "REGISTERED" && approved.merkleRoot, "approval registers land into Merkle tree");

  // ZK way #1: commitment opening
  const p1 = await proofService.generateProof({
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string,
    landId: "LAND-2026-001",
    ownerSecret: aliceSecret,
    proofType: PROOF_TYPES.COMMITMENT_OPENING
  });
  assert(p1.verified, "ZK#1 commitment-opening proof verifies");

  // ZK way #2: registry membership
  const p2 = await proofService.generateProof({
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string,
    landId: "LAND-2026-001",
    ownerSecret: aliceSecret,
    proofType: PROOF_TYPES.REGISTRY_MEMBERSHIP
  });
  assert(p2.verified, "ZK#2 registry-membership proof verifies");

  // ZK way #4: area range (true statement)
  const p4 = await proofService.generateProof({
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string,
    landId: "LAND-2026-001",
    ownerSecret: aliceSecret,
    proofType: PROOF_TYPES.AREA_RANGE,
    minArea: 1000
  });
  assert(p4.verified, "ZK#4 area-range proof verifies (area 4500 >= 1000)");

  await expectError(
    proofService.generateProof({
      userId: String(aliceU.id),
      userWallet: aliceU.walletAddress as string,
      landId: "LAND-2026-001",
      ownerSecret: aliceSecret,
      proofType: PROOF_TYPES.AREA_RANGE,
      minArea: 999999
    }),
    "ZK#4 cannot prove a false area statement"
  );

  await expectError(
    proofService.generateProof({
      userId: String(bobU.id),
      userWallet: bobU.walletAddress as string,
      landId: "LAND-2026-001",
      ownerSecret: aliceSecret,
      proofType: PROOF_TYPES.COMMITMENT_OPENING
    }),
    "non-owner cannot generate proofs for someone else's land"
  );

  await expectError(
    proofService.generateProof({
      userId: String(aliceU.id),
      userWallet: aliceU.walletAddress as string,
      landId: "LAND-2026-001",
      ownerSecret: "wrong-secret-123",
      proofType: PROOF_TYPES.COMMITMENT_OPENING
    }),
    "wrong owner secret is rejected"
  );

  await landService.listLandForSale({ landId: "LAND-2026-001", salePrice: "3.2 ETH", userId: String(aliceU.id) });

  await expectError(
    transferService.buyListedLand({
      landId: "LAND-2026-001",
      buyerId: String(bobU.id),
      buyerWallet: bobU.walletAddress as string,
      newOwnerSecret: "bob-fresh-secret-9"
    }),
    "buying without a verified ZK challenge is blocked"
  );

  // ZK way #3: challenge-response between buyer and seller
  const challenge = await challengeService.createChallenge({
    buyerId: String(bobU.id),
    buyerWallet: bobU.walletAddress as string,
    landId: "LAND-2026-001",
    message: "Are you the authentic owner?"
  });
  assert(challenge.status === "PENDING" && challenge.nonce, "buyer challenge created with one-time nonce");

  await challengeService.respondToChallenge({
    challengeId: String(challenge._id),
    sellerId: String(aliceU.id),
    sellerWallet: aliceU.walletAddress as string,
    ownerSecret: aliceSecret
  });

  const verified = await challengeService.verifyChallenge({
    challengeId: String(challenge._id),
    buyerId: String(bobU.id)
  });
  assert(verified?.status === "VERIFIED", "ZK#3 challenge-response proof verified by buyer");

  const sale = await transferService.buyListedLand({
    landId: "LAND-2026-001",
    buyerId: String(bobU.id),
    buyerWallet: bobU.walletAddress as string,
    newOwnerSecret: "bob-fresh-secret-9"
  });
  assert(sale.land?.ownerWallet === bobU.walletAddress, "purchase transfers ownership to buyer");
  assert(sale.land?.landCommitment !== approved.landCommitment, "land is re-committed to the buyer's secret");
  assert(sale.land?.status === "PENDING_APPROVAL", "purchase creates a re-registration request for the authority");

  await expectError(
    proofService.generateProof({
      userId: String(aliceU.id),
      userWallet: aliceU.walletAddress as string,
      landId: "LAND-2026-001",
      ownerSecret: aliceSecret,
      proofType: PROOF_TYPES.COMMITMENT_OPENING
    }),
    "previous owner can no longer prove ownership after sale"
  );

  await expectError(
    proofService.generateProof({
      userId: String(bobU.id),
      userWallet: bobU.walletAddress as string,
      landId: "LAND-2026-001",
      ownerSecret: "bob-fresh-secret-9",
      proofType: PROOF_TYPES.COMMITMENT_OPENING
    }),
    "new owner cannot prove until the authority re-registers the land"
  );

  // Authority re-registers the purchased land under the new owner.
  await landService.approveLand({ landId: "LAND-2026-001", authorityId: String(authority!._id) });
  const reRegistered = await landService.getLand("LAND-2026-001");
  assert(
    reRegistered.status === "REGISTERED" && Boolean(reRegistered.merkleRoot),
    "authority re-registers the land to the new owner"
  );

  const p5 = await proofService.generateProof({
    userId: String(bobU.id),
    userWallet: bobU.walletAddress as string,
    landId: "LAND-2026-001",
    ownerSecret: "bob-fresh-secret-9",
    proofType: PROOF_TYPES.COMMITMENT_OPENING
  });
  assert(p5.verified, "new owner proves ownership with their fresh secret");

  console.log("\nAll smoke checks passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

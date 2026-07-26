/**
 * Full-flow smoke test against an in-memory MongoDB:
 * user registration → land request → authority approval → listing →
 * buyer challenge → seller ZK proof → buyer verification → purchase →
 * post-transfer security checks.
 *
 * The owner secret NEVER reaches a service call: this script emulates the
 * browser by deriving commitments and generating Groth16 proofs locally
 * (exactly what apps/client/src/lib/zk.ts does with snarkjs wasm) and only
 * hands {commitments, proofs, publicSignals} to the server services.
 *
 * Run: npm run smoke   (from apps/server)
 */
import "./forceOffline";
import { randomBytes } from "crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as auth from "../services/auth.service";
import * as landService from "../services/land.service";
import * as proofService from "../services/proof.service";
import * as challengeService from "../services/challenge.service";
import * as transferService from "../services/transfer.service";
import { UserModel } from "../models/User.model";
import { PROOF_TYPES } from "../constants/proofTypes";
import { areaSaltField, landIdToField, secretToField } from "../utils/field.util";
import { poseidonHash2 } from "../services/poseidon.service";
import { proveWithCircuit } from "../services/zk.service";

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

// ---- "Browser" helpers: mirror apps/client/src/lib/zk.ts ------------------

/**
 * Mirrors the client's generateOwnerSecret(): a 256-bit CSPRNG value, NOT a
 * chosen passphrase. A low-entropy secret would be recoverable from the
 * public commitment by offline dictionary search.
 */
function generateOwnerSecret(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

async function browserCommitments(landId: string, ownerSecret: string, areaSqm: number) {
  const landIdField = landIdToField(landId);
  const secretField = secretToField(landId, ownerSecret);
  const landCommitment = await poseidonHash2(landIdField, secretField);
  const areaCommitment = await poseidonHash2(String(Math.floor(areaSqm)), areaSaltField(landId, ownerSecret));
  return { landCommitment, areaCommitment };
}

async function browserProveCommitmentOpening(landId: string, ownerSecret: string, commitment: string) {
  return proveWithCircuit("commitmentProof", {
    ownerSecret: secretToField(landId, ownerSecret),
    landIdField: landIdToField(landId),
    commitment
  });
}

async function browserProveMembership(
  landId: string,
  ownerSecret: string,
  land: { pathElements?: string[]; pathIndices?: number[]; merkleRoot?: string | null }
) {
  return proveWithCircuit("landOwnership", {
    landIdField: landIdToField(landId),
    ownerSecret: secretToField(landId, ownerSecret),
    pathElements: land.pathElements,
    pathIndices: land.pathIndices,
    merkleRoot: land.merkleRoot
  });
}

async function browserProveChallenge(
  landId: string,
  ownerSecret: string,
  land: { pathElements?: string[]; pathIndices?: number[]; merkleRoot?: string | null },
  nonce: string
) {
  return proveWithCircuit("challengeProof", {
    ownerSecret: secretToField(landId, ownerSecret),
    pathElements: land.pathElements,
    pathIndices: land.pathIndices,
    landIdField: landIdToField(landId),
    merkleRoot: land.merkleRoot,
    challenge: nonce
  });
}

async function browserProveAreaRange(
  landId: string,
  ownerSecret: string,
  areaSqm: number,
  areaCommitment: string,
  minArea: number
) {
  return proveWithCircuit("areaRange", {
    areaValue: String(areaSqm),
    areaSalt: areaSaltField(landId, ownerSecret),
    areaCommitment,
    minArea: String(minArea)
  });
}

// ---------------------------------------------------------------------------

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

  // The secret stays in this "browser" scope — it is never passed to a service.
  const aliceSecret = generateOwnerSecret();
  const aliceCommitments = await browserCommitments("LAND-2026-001", aliceSecret, 4500);
  const land = await landService.requestLandRegistration({
    landId: "LAND-2026-001",
    plotNumber: "PLOT-9",
    location: "Dhanmondi, Dhaka",
    areaSqm: 4500,
    landCommitment: aliceCommitments.landCommitment,
    areaCommitment: aliceCommitments.areaCommitment,
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string
  });
  assert(land.status === "PENDING_APPROVAL", "land request starts pending approval");

  const pending = await landService.listPendingRequests();
  const applicant = pending[0]?.ownerId as unknown as { name?: string; nidHash?: string };
  assert(applicant?.name === "Alice Rahman" && applicant?.nidHash, "authority sees applicant identity on request");

  // Approval also generates + checks the rootTransition Groth16 proof.
  await landService.approveLand({ landId: "LAND-2026-001", authorityId: String(authority!._id) });
  const approved = await landService.getLand("LAND-2026-001");
  assert(approved.status === "REGISTERED" && approved.merkleRoot, "approval registers land into Merkle tree");

  // ZK way #1: commitment opening (proved in the "browser", submitted to server)
  const proved1 = await browserProveCommitmentOpening("LAND-2026-001", aliceSecret, approved.landCommitment);
  const p1 = await proofService.submitProof({
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string,
    landId: "LAND-2026-001",
    proofType: PROOF_TYPES.COMMITMENT_OPENING,
    proof: proved1.proof,
    publicSignals: proved1.publicSignals
  });
  assert(p1.verified, "ZK#1 client-generated commitment-opening proof accepted");

  // ZK way #2: registry membership
  const proved2 = await browserProveMembership("LAND-2026-001", aliceSecret, approved);
  const p2 = await proofService.submitProof({
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string,
    landId: "LAND-2026-001",
    proofType: PROOF_TYPES.REGISTRY_MEMBERSHIP,
    proof: proved2.proof,
    publicSignals: proved2.publicSignals
  });
  assert(p2.verified, "ZK#2 client-generated registry-membership proof accepted");

  // ZK way #4: area range (true statement)
  const proved4 = await browserProveAreaRange("LAND-2026-001", aliceSecret, 4500, approved.areaCommitment, 1000);
  const p4 = await proofService.submitProof({
    userId: String(aliceU.id),
    userWallet: aliceU.walletAddress as string,
    landId: "LAND-2026-001",
    proofType: PROOF_TYPES.AREA_RANGE,
    proof: proved4.proof,
    publicSignals: proved4.publicSignals
  });
  assert(p4.verified, "ZK#4 client-generated area-range proof accepted (area 4500 >= 1000)");

  await expectError(
    browserProveAreaRange("LAND-2026-001", aliceSecret, 4500, approved.areaCommitment, 999999),
    "ZK#4 cannot prove a false area statement (witness generation fails)"
  );

  await expectError(
    proofService.submitProof({
      userId: String(bobU.id),
      userWallet: bobU.walletAddress as string,
      landId: "LAND-2026-001",
      proofType: PROOF_TYPES.COMMITMENT_OPENING,
      proof: proved1.proof,
      publicSignals: proved1.publicSignals
    }),
    "a stolen (valid) proof cannot be submitted by a non-owner"
  );

  await expectError(
    browserProveCommitmentOpening("LAND-2026-001", generateOwnerSecret(), approved.landCommitment),
    "wrong owner secret cannot produce a proof (witness generation fails)"
  );

  await expectError(
    proofService.submitProof({
      userId: String(aliceU.id),
      userWallet: aliceU.walletAddress as string,
      landId: "LAND-2026-001",
      proofType: PROOF_TYPES.COMMITMENT_OPENING,
      proof: proved1.proof,
      publicSignals: [proved1.publicSignals[0], String(BigInt(proved1.publicSignals[1]) + 1n)]
    }),
    "tampered public signals are rejected"
  );

  await landService.listLandForSale({ landId: "LAND-2026-001", salePrice: "3.2 ETH", userId: String(aliceU.id) });

  const bobSecret = generateOwnerSecret();
  const bobCommitments = await browserCommitments("LAND-2026-001", bobSecret, 4500);

  await expectError(
    transferService.buyListedLand({
      landId: "LAND-2026-001",
      buyerId: String(bobU.id),
      buyerWallet: bobU.walletAddress as string,
      newLandCommitment: bobCommitments.landCommitment,
      newAreaCommitment: bobCommitments.areaCommitment
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

  const listedLand = await landService.getLand("LAND-2026-001");
  const proved3 = await browserProveChallenge("LAND-2026-001", aliceSecret, listedLand, challenge.nonce);
  await challengeService.respondToChallenge({
    challengeId: String(challenge._id),
    sellerId: String(aliceU.id),
    sellerWallet: aliceU.walletAddress as string,
    proof: proved3.proof,
    publicSignals: proved3.publicSignals
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
    newLandCommitment: bobCommitments.landCommitment,
    newAreaCommitment: bobCommitments.areaCommitment
  });
  assert(sale.land?.ownerWallet === bobU.walletAddress, "purchase transfers ownership to buyer");
  assert(sale.land?.landCommitment !== approved.landCommitment, "land is re-committed to the buyer's secret");
  assert(sale.land?.status === "PENDING_APPROVAL", "purchase creates a re-registration request for the authority");

  await expectError(
    proofService.submitProof({
      userId: String(aliceU.id),
      userWallet: aliceU.walletAddress as string,
      landId: "LAND-2026-001",
      proofType: PROOF_TYPES.COMMITMENT_OPENING,
      proof: proved1.proof,
      publicSignals: proved1.publicSignals
    }),
    "previous owner can no longer prove ownership after sale"
  );

  await expectError(
    (async () => {
      const proved = await browserProveCommitmentOpening("LAND-2026-001", bobSecret, bobCommitments.landCommitment);
      return proofService.submitProof({
        userId: String(bobU.id),
        userWallet: bobU.walletAddress as string,
        landId: "LAND-2026-001",
        proofType: PROOF_TYPES.COMMITMENT_OPENING,
        proof: proved.proof,
        publicSignals: proved.publicSignals
      });
    })(),
    "new owner cannot prove until the authority re-registers the land"
  );

  // Authority re-registers the purchased land under the new owner.
  await landService.approveLand({ landId: "LAND-2026-001", authorityId: String(authority!._id) });
  const reRegistered = await landService.getLand("LAND-2026-001");
  assert(
    reRegistered.status === "REGISTERED" && Boolean(reRegistered.merkleRoot),
    "authority re-registers the land to the new owner"
  );

  const proved5 = await browserProveCommitmentOpening("LAND-2026-001", bobSecret, reRegistered.landCommitment);
  const p5 = await proofService.submitProof({
    userId: String(bobU.id),
    userWallet: bobU.walletAddress as string,
    landId: "LAND-2026-001",
    proofType: PROOF_TYPES.COMMITMENT_OPENING,
    proof: proved5.proof,
    publicSignals: proved5.publicSignals
  });
  assert(p5.verified, "new owner proves ownership with their fresh secret");

  console.log("\nAll smoke checks passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

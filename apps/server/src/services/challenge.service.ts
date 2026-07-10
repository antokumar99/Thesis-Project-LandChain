import { ChallengeModel } from "../models/Challenge.model";
import { LandModel } from "../models/Land.model";
import { ProofModel } from "../models/Proof.model";
import { TransactionModel } from "../models/Transaction.model";
import { UserModel } from "../models/User.model";
import { PROOF_TYPES } from "../constants/proofTypes";
import { buyerBoundChallenge, landIdToField, randomChallengeSalt } from "../utils/field.util";
import { deterministicTxHash } from "../utils/hash.util";
import { verifyWithCircuit, type CircuitName } from "./zk.service";
import { generateProof } from "./proof.service";
import { badRequest, forbidden, notFound } from "../utils/errors.util";

/**
 * A buyer asks the seller of a listed land to prove they are the authentic
 * owner. A one-time nonce is generated; the seller must bind it into a
 * challenge-response ZK proof.
 */
export async function createChallenge(input: {
  buyerId: string;
  buyerWallet: string;
  landId: string;
  message?: string;
}) {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (land.status !== "LISTED_FOR_SALE") throw badRequest("Authenticity challenges are for lands listed for sale.");
  if (String(land.ownerId) === input.buyerId) throw badRequest("You cannot challenge your own land.");

  const existing = await ChallengeModel.findOne({
    landId: input.landId,
    buyerId: input.buyerId,
    status: { $in: ["PENDING", "PROOF_SUBMITTED"] }
  });
  if (existing) throw badRequest("You already have an open challenge for this land.");

  const buyer = await UserModel.findById(input.buyerId);

  // Nonce bound to the buyer's wallet so the on-chain contract can later
  // verify the seller's proof was produced for THIS buyer (anti-redirect).
  const nonceSalt = randomChallengeSalt();
  const nonce = buyerBoundChallenge(input.buyerWallet, nonceSalt);

  const challenge = await ChallengeModel.create({
    landId: input.landId,
    buyerId: input.buyerId,
    sellerId: land.ownerId,
    buyerWallet: input.buyerWallet.toLowerCase(),
    sellerWallet: land.ownerWallet,
    nonce,
    nonceSalt,
    status: "PENDING",
    messages: [
      {
        sender: input.buyerId,
        senderName: buyer?.name ?? "Buyer",
        body:
          input.message ??
          "Are you the authentic owner of this land? Please prove it with a zero-knowledge proof.",
        sentAt: new Date()
      }
    ]
  });

  await TransactionModel.create({
    landId: input.landId,
    fromOwner: input.buyerWallet.toLowerCase(),
    toOwner: land.ownerWallet,
    transactionType: "CHALLENGE_CREATED",
    blockchainTxHash: deterministicTxHash(`challenge:${challenge.id}`),
    status: "PENDING",
    detail: "Buyer requested a zero-knowledge ownership proof."
  });

  return challenge;
}

export async function listChallenges(userId: string) {
  const [asBuyer, asSeller] = await Promise.all([
    ChallengeModel.find({ buyerId: userId })
      .sort({ updatedAt: -1 })
      .populate("sellerId", "name walletAddress"),
    ChallengeModel.find({ sellerId: userId })
      .sort({ updatedAt: -1 })
      .populate("buyerId", "name walletAddress")
  ]);
  return { asBuyer, asSeller };
}

export async function getChallenge(input: { challengeId: string; userId: string; role: string }) {
  const challenge = await ChallengeModel.findById(input.challengeId)
    .populate("buyerId", "name walletAddress")
    .populate("sellerId", "name walletAddress")
    .populate("proofId");
  if (!challenge) throw notFound("Challenge not found.");

  const buyerId = String((challenge.buyerId as { _id?: unknown })?._id ?? challenge.buyerId);
  const sellerId = String((challenge.sellerId as { _id?: unknown })?._id ?? challenge.sellerId);
  if (input.role !== "AUTHORITY" && input.userId !== buyerId && input.userId !== sellerId) {
    throw forbidden("You are not a participant of this challenge.");
  }
  return challenge;
}

export async function addChallengeMessage(input: { challengeId: string; userId: string; role: string; body: string }) {
  const challenge = await getChallenge(input);
  const sender = await UserModel.findById(input.userId);
  challenge.messages.push({
    sender: input.userId,
    senderName: sender?.name ?? "User",
    body: input.body,
    sentAt: new Date()
  } as never);
  await challenge.save();
  return challenge;
}

/** Seller answers the challenge by generating a nonce-bound ZK proof. */
export async function respondToChallenge(input: {
  challengeId: string;
  sellerId: string;
  sellerWallet: string;
  ownerSecret: string;
}) {
  const challenge = await ChallengeModel.findById(input.challengeId);
  if (!challenge) throw notFound("Challenge not found.");
  if (String(challenge.sellerId) !== input.sellerId) throw forbidden("Only the challenged seller can respond.");
  if (challenge.status !== "PENDING" && challenge.status !== "PROOF_SUBMITTED") {
    throw badRequest(`Challenge is already ${challenge.status.toLowerCase()}.`);
  }

  const proofDoc = await generateProof({
    userId: input.sellerId,
    userWallet: input.sellerWallet,
    landId: challenge.landId,
    ownerSecret: input.ownerSecret,
    proofType: PROOF_TYPES.CHALLENGE_RESPONSE,
    challengeId: input.challengeId
  });

  return { challenge: await ChallengeModel.findById(input.challengeId).populate("proofId"), proof: proofDoc };
}

/**
 * Buyer verifies the seller's proof: Groth16 verification plus semantic
 * checks that the public signals bind to THIS land, THIS nonce, and the
 * CURRENT registry root.
 */
export async function verifyChallenge(input: { challengeId: string; buyerId: string }) {
  const challenge = await ChallengeModel.findById(input.challengeId);
  if (!challenge) throw notFound("Challenge not found.");
  if (String(challenge.buyerId) !== input.buyerId) throw forbidden("Only the challenging buyer can verify.");
  if (challenge.status !== "PROOF_SUBMITTED" || !challenge.proofId) {
    throw badRequest("The seller has not submitted a proof yet.");
  }

  const proofDoc = await ProofModel.findById(challenge.proofId);
  const land = await LandModel.findOne({ landId: challenge.landId });
  if (!proofDoc || !land) throw notFound("Proof or land record missing.");

  const notes: string[] = [];
  const cryptographicOk = await verifyWithCircuit(
    proofDoc.circuit as CircuitName,
    proofDoc.proof,
    proofDoc.publicSignals
  );
  notes.push(cryptographicOk ? "Groth16 proof valid." : "Groth16 proof INVALID.");

  let semanticOk = true;
  const signals = proofDoc.publicSignals;
  if (signals[1] !== landIdToField(land.landId)) { semanticOk = false; notes.push("Proof is for a different land."); }
  if (signals[2] !== land.merkleRoot) { semanticOk = false; notes.push("Merkle root is stale — registry changed since proof."); }
  if (signals[3] !== challenge.nonce) { semanticOk = false; notes.push("Challenge nonce mismatch — possible replay."); }
  if (String(land.ownerId) !== String(challenge.sellerId)) { semanticOk = false; notes.push("Seller is no longer the registered owner."); }

  const verified = cryptographicOk && semanticOk;
  if (verified) notes.push("Seller is the authentic current owner of this land.");

  challenge.status = verified ? "VERIFIED" : "FAILED";
  challenge.verifiedAt = new Date();
  challenge.verificationNote = notes.join(" ");
  challenge.messages.push({
    sender: challenge.buyerId,
    senderName: "Buyer",
    body: verified
      ? "I verified your zero-knowledge proof. Ownership is authentic."
      : `Proof verification failed: ${notes.join(" ")}`,
    sentAt: new Date()
  } as never);
  await challenge.save();

  proofDoc.verified = verified;
  proofDoc.verifiedAt = new Date();
  proofDoc.verificationNote = challenge.verificationNote;
  await proofDoc.save();

  await TransactionModel.create({
    landId: challenge.landId,
    fromOwner: challenge.sellerWallet,
    toOwner: challenge.buyerWallet,
    transactionType: "PROOF_VERIFIED",
    blockchainTxHash: deterministicTxHash(`challenge-verify:${challenge.id}:${verified}`),
    status: verified ? "VERIFIED" : "REJECTED",
    detail: challenge.verificationNote
  });

  return ChallengeModel.findById(input.challengeId).populate("proofId");
}

export async function declineChallenge(input: { challengeId: string; sellerId: string }) {
  const challenge = await ChallengeModel.findById(input.challengeId);
  if (!challenge) throw notFound("Challenge not found.");
  if (String(challenge.sellerId) !== input.sellerId) throw forbidden("Only the challenged seller can decline.");
  if (challenge.status !== "PENDING") throw badRequest("Only pending challenges can be declined.");

  challenge.status = "DECLINED";
  await challenge.save();
  return challenge;
}

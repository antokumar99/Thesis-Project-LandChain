import { LandModel } from "../models/Land.model";
import { ProofModel } from "../models/Proof.model";
import { ChallengeModel } from "../models/Challenge.model";
import { MerkleRootModel } from "../models/MerkleRoot.model";
import { TransactionModel } from "../models/Transaction.model";
import { PROOF_TYPE_CIRCUITS, PROOF_TYPES, PUBLIC_SIGNAL_LABELS, type ProofType } from "../constants/proofTypes";
import { isFieldElement, landIdToField } from "../utils/field.util";
import { deterministicTxHash } from "../utils/hash.util";
import { verifyWithCircuit, type CircuitName } from "../services/zk.service";
import type { Groth16Proof } from "../types/proof.types";
import { badRequest, forbidden, notFound } from "../utils/errors.util";

function isGroth16ProofShape(value: unknown): value is Groth16Proof {
  if (!value || typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  return Array.isArray(proof.pi_a) && Array.isArray(proof.pi_b) && Array.isArray(proof.pi_c);
}

/**
 * Accept and verify a zero-knowledge proof that was GENERATED IN THE OWNER'S
 * BROWSER. The owner secret never reaches the server: the client builds the
 * witness locally (snarkjs wasm prover) and submits only {proof,
 * publicSignals}. The server verifies the proof cryptographically (Groth16)
 * and semantically (the public signals must bind to this land, the current
 * registry state, and — for challenge responses — the buyer's nonce) before
 * persisting it.
 */
export async function submitProof(input: {
  userId: string;
  userWallet: string;
  landId: string;
  proofType: ProofType;
  proof: unknown;
  publicSignals: unknown;
  challengeId?: string;
}) {
  if (!Object.values(PROOF_TYPES).includes(input.proofType)) throw badRequest("Unsupported proof type.");
  if (!isGroth16ProofShape(input.proof)) throw badRequest("proof must be a snarkjs Groth16 proof object.");
  if (!Array.isArray(input.publicSignals) || !input.publicSignals.every((s) => isFieldElement(s))) {
    throw badRequest("publicSignals must be an array of decimal field elements.");
  }
  const signals = input.publicSignals as string[];

  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (land.status !== "REGISTERED" && land.status !== "LISTED_FOR_SALE") {
    throw badRequest("Proofs can only be submitted for approved lands.");
  }
  if (String(land.ownerId) !== input.userId) {
    throw forbidden("Only the owner can submit a proof for their own land.");
  }

  const circuit = PROOF_TYPE_CIRCUITS[input.proofType] as CircuitName;
  const expectedLabels = PUBLIC_SIGNAL_LABELS[input.proofType];
  if (signals.length !== expectedLabels.length) {
    throw badRequest(`Expected ${expectedLabels.length} public signals (${expectedLabels.join(", ")}).`);
  }

  // ---- Semantic binding: the proof must be about THIS land and the CURRENT
  // registry state, otherwise a cryptographically valid proof could be reused
  // out of context.
  let challengeDoc = null;
  switch (input.proofType) {
    case PROOF_TYPES.COMMITMENT_OPENING:
      if (signals[0] !== landIdToField(input.landId)) throw badRequest("Proof is bound to a different land.");
      if (signals[1] !== land.landCommitment) throw badRequest("Proof does not open this land's commitment.");
      break;

    case PROOF_TYPES.REGISTRY_MEMBERSHIP:
      if (!land.merkleRoot) throw badRequest("Land has no Merkle path yet.");
      if (signals[1] !== land.merkleRoot) throw badRequest("Proof is for a stale registry root.");
      break;

    case PROOF_TYPES.CHALLENGE_RESPONSE: {
      if (!input.challengeId) throw badRequest("challengeId is required for a challenge-response proof.");
      challengeDoc = await ChallengeModel.findById(input.challengeId);
      if (!challengeDoc) throw notFound("Challenge not found.");
      if (String(challengeDoc.sellerId) !== input.userId) throw forbidden("Only the challenged seller can respond.");
      if (challengeDoc.landId !== input.landId) throw badRequest("Challenge is for a different land.");
      if (challengeDoc.status !== "PENDING" && challengeDoc.status !== "PROOF_SUBMITTED") {
        throw badRequest(`Challenge is already ${challengeDoc.status.toLowerCase()}.`);
      }
      if (!land.merkleRoot) throw badRequest("Land has no Merkle path yet.");
      if (signals[1] !== landIdToField(input.landId)) throw badRequest("Proof is bound to a different land.");
      if (signals[2] !== land.merkleRoot) throw badRequest("Proof is for a stale registry root.");
      if (signals[3] !== challengeDoc.nonce) throw badRequest("Proof does not answer this challenge's nonce.");
      break;
    }

    case PROOF_TYPES.AREA_RANGE:
      if (signals[0] !== land.areaCommitment) throw badRequest("Proof does not open this land's area commitment.");
      break;
  }

  // ---- Cryptographic verification (snarkjs Groth16, server-held vkey).
  const cryptographicOk = await verifyWithCircuit(circuit, input.proof, signals);
  if (!cryptographicOk) throw badRequest("Groth16 verification failed — the proof is not valid.");

  const transactionHash = deterministicTxHash(`proof:${input.proofType}:${input.landId}:${input.userWallet}`);
  const proofDoc = await ProofModel.create({
    proofType: input.proofType,
    circuit,
    landId: input.landId,
    ownerId: input.userId,
    ownerWallet: input.userWallet.toLowerCase(),
    challengeId: challengeDoc?._id,
    proof: input.proof,
    publicSignals: signals,
    publicSignalLabels: expectedLabels,
    merkleRoot: land.merkleRoot,
    verified: true,
    verifiedAt: new Date(),
    verificationNote: "Client-generated proof verified on submission (snarkjs groth16 + semantic binding).",
    transactionHash
  });

  if (challengeDoc) {
    challengeDoc.proofId = proofDoc._id;
    challengeDoc.status = "PROOF_SUBMITTED";
    challengeDoc.messages.push({
      sender: challengeDoc.sellerId,
      senderName: "Seller",
      body: "Submitted a zero-knowledge ownership proof for your challenge.",
      sentAt: new Date()
    } as never);
    await challengeDoc.save();
  }

  await TransactionModel.create({
    landId: input.landId,
    fromOwner: input.userWallet.toLowerCase(),
    transactionType: "PROOF_GENERATED",
    blockchainTxHash: transactionHash,
    status: "VERIFIED",
    detail: `${input.proofType} proof submitted from the owner's browser (circuit ${circuit}).`
  });

  return proofDoc;
}

/** Caller must be the proof owner, a participant of its challenge, or the authority. */
async function assertProofAccess(proofDoc: { ownerId: unknown; challengeId?: unknown }, userId: string, role: string) {
  if (role === "AUTHORITY") return;
  if (String(proofDoc.ownerId) === userId) return;
  if (proofDoc.challengeId) {
    const challenge = await ChallengeModel.findById(proofDoc.challengeId);
    if (challenge && (String(challenge.buyerId) === userId || String(challenge.sellerId) === userId)) return;
  }
  throw forbidden("You are not authorized to access this proof.");
}

/**
 * Re-verify a stored proof cryptographically (snarkjs) AND semantically
 * (public signals must match the current registry state).
 */
export async function verifyProofRecord(input: { proofId: string; verifierId: string; verifierRole: string }) {
  const proofDoc = await ProofModel.findById(input.proofId);
  if (!proofDoc) throw notFound("Proof not found.");
  await assertProofAccess(proofDoc, input.verifierId, input.verifierRole);

  const circuit = proofDoc.circuit as CircuitName;
  const cryptographicOk = await verifyWithCircuit(circuit, proofDoc.proof, proofDoc.publicSignals);

  const notes: string[] = [cryptographicOk ? "Groth16 verification passed." : "Groth16 verification FAILED."];
  let semanticOk = true;

  const land = proofDoc.landId ? await LandModel.findOne({ landId: proofDoc.landId }) : null;
  const signals = proofDoc.publicSignals;

  switch (proofDoc.proofType) {
    case PROOF_TYPES.COMMITMENT_OPENING:
      if (!land) { semanticOk = false; notes.push("Land no longer exists."); break; }
      if (signals[0] !== landIdToField(land.landId)) { semanticOk = false; notes.push("Land binding mismatch."); }
      if (signals[1] !== land.landCommitment) {
        semanticOk = false;
        notes.push("Commitment differs from the current registry record (ownership may have changed).");
      }
      break;

    case PROOF_TYPES.REGISTRY_MEMBERSHIP: {
      const latestRoot = await MerkleRootModel.findOne().sort({ createdAt: -1 });
      if (!latestRoot || signals[1] !== latestRoot.root) {
        semanticOk = false;
        notes.push("Merkle root is not the current registry root (proof is stale).");
      }
      break;
    }

    case PROOF_TYPES.CHALLENGE_RESPONSE: {
      const challenge = proofDoc.challengeId ? await ChallengeModel.findById(proofDoc.challengeId) : null;
      if (!challenge || !land) { semanticOk = false; notes.push("Challenge or land record missing."); break; }
      if (signals[1] !== landIdToField(land.landId)) { semanticOk = false; notes.push("Land binding mismatch."); }
      if (signals[2] !== land.merkleRoot) { semanticOk = false; notes.push("Merkle root is stale."); }
      if (signals[3] !== challenge.nonce) { semanticOk = false; notes.push("Challenge nonce mismatch."); }
      break;
    }

    case PROOF_TYPES.AREA_RANGE:
      if (!land) { semanticOk = false; notes.push("Land no longer exists."); break; }
      if (signals[0] !== land.areaCommitment) { semanticOk = false; notes.push("Area commitment mismatch."); }
      break;
  }

  const verified = cryptographicOk && semanticOk;
  proofDoc.verified = verified;
  proofDoc.verifiedAt = new Date();
  proofDoc.verificationNote = notes.join(" ");
  await proofDoc.save();

  await TransactionModel.create({
    landId: proofDoc.landId,
    transactionType: "PROOF_VERIFIED",
    blockchainTxHash: deterministicTxHash(`verify:${proofDoc.id}:${verified}`),
    status: verified ? "VERIFIED" : "REJECTED",
    detail: proofDoc.verificationNote
  });

  return proofDoc;
}

export async function listProofs(input: { userId: string; role: string; landId?: string }) {
  const query: Record<string, unknown> = {};
  if (input.landId) query.landId = input.landId;
  if (input.role !== "AUTHORITY") query.ownerId = input.userId;
  return ProofModel.find(query).sort({ createdAt: -1 });
}

export async function getProof(proofId: string, userId: string, role: string) {
  const proofDoc = await ProofModel.findById(proofId);
  if (!proofDoc) throw notFound("Proof not found.");
  await assertProofAccess(proofDoc, userId, role);
  return proofDoc;
}

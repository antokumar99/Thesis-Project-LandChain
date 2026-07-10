import { LandModel } from "../models/Land.model";
import { ProofModel } from "../models/Proof.model";
import { ChallengeModel } from "../models/Challenge.model";
import { MerkleRootModel } from "../models/MerkleRoot.model";
import { TransactionModel } from "../models/Transaction.model";
import { PROOF_TYPE_CIRCUITS, PROOF_TYPES, type ProofType } from "../constants/proofTypes";
import { areaSaltField, landIdToField, secretToField } from "../utils/field.util";
import { deterministicTxHash } from "../utils/hash.util";
import { poseidonHash2 } from "./poseidon.service";
import { proveWithCircuit, verifyWithCircuit, type CircuitName } from "../services/zk.service";
import { badRequest, forbidden, notFound } from "../utils/errors.util";

async function assertOwnedLandWithSecret(input: {
  landId: string;
  userId: string;
  ownerSecret: string;
}) {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (land.status !== "REGISTERED" && land.status !== "LISTED_FOR_SALE") {
    throw badRequest("Proofs can only be generated for approved lands.");
  }
  if (String(land.ownerId) !== input.userId) {
    throw forbidden("Only the owner can generate a proof for their own land.");
  }

  const landIdField = landIdToField(input.landId);
  const secretField = secretToField(input.landId, input.ownerSecret);
  const commitment = await poseidonHash2(landIdField, secretField);
  if (commitment !== land.landCommitment) {
    throw badRequest("Owner secret does not match this land record.");
  }

  return { land, landIdField, secretField };
}

/**
 * Generate one of the four supported zero-knowledge proofs. The owner secret
 * is used only to build the witness and is never stored.
 */
export async function generateProof(input: {
  userId: string;
  userWallet: string;
  landId: string;
  ownerSecret: string;
  proofType: ProofType;
  challengeId?: string;
  minArea?: number;
}) {
  const { land, landIdField, secretField } = await assertOwnedLandWithSecret(input);
  const circuit = PROOF_TYPE_CIRCUITS[input.proofType] as CircuitName;

  let circuitInput: Record<string, unknown>;
  let challengeDoc = null;

  switch (input.proofType) {
    case PROOF_TYPES.COMMITMENT_OPENING:
      circuitInput = { ownerSecret: secretField, landIdField, commitment: land.landCommitment };
      break;

    case PROOF_TYPES.REGISTRY_MEMBERSHIP:
      if (!land.merkleRoot || !land.pathElements?.length) throw badRequest("Land has no Merkle path yet.");
      circuitInput = {
        landIdField,
        ownerSecret: secretField,
        pathElements: land.pathElements,
        pathIndices: land.pathIndices,
        merkleRoot: land.merkleRoot
      };
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
      if (!land.merkleRoot || !land.pathElements?.length) throw badRequest("Land has no Merkle path yet.");
      circuitInput = {
        ownerSecret: secretField,
        pathElements: land.pathElements,
        pathIndices: land.pathIndices,
        landIdField,
        merkleRoot: land.merkleRoot,
        challenge: challengeDoc.nonce
      };
      break;
    }

    case PROOF_TYPES.AREA_RANGE: {
      const minArea = Math.floor(Number(input.minArea));
      if (!Number.isFinite(minArea) || minArea <= 0) throw badRequest("minArea must be a positive number.");
      circuitInput = {
        areaValue: String(land.areaSqm),
        areaSalt: areaSaltField(input.landId, input.ownerSecret),
        areaCommitment: land.areaCommitment,
        minArea: String(minArea)
      };
      break;
    }

    default:
      throw badRequest("Unsupported proof type.");
  }

  let proved;
  try {
    proved = await proveWithCircuit(circuit, circuitInput);
  } catch (error) {
    if (error instanceof Error && /Assert Failed|Error in template/i.test(error.message)) {
      throw badRequest("The statement is not true for this land, so no proof can be generated.");
    }
    throw error;
  }

  // Sanity: verify our own proof before persisting it.
  const selfVerified = await verifyWithCircuit(circuit, proved.proof, proved.publicSignals);

  const transactionHash = deterministicTxHash(`proof:${input.proofType}:${input.landId}:${input.userWallet}`);
  const proofDoc = await ProofModel.create({
    proofType: input.proofType,
    circuit,
    landId: input.landId,
    ownerId: input.userId,
    ownerWallet: input.userWallet.toLowerCase(),
    challengeId: challengeDoc?._id,
    proof: proved.proof,
    publicSignals: proved.publicSignals,
    publicSignalLabels: proved.publicSignalLabels,
    merkleRoot: land.merkleRoot,
    verified: selfVerified,
    verifiedAt: selfVerified ? new Date() : undefined,
    verificationNote: selfVerified ? "Verified at generation time (snarkjs groth16)." : "Self-verification failed.",
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
    status: selfVerified ? "VERIFIED" : "FAILED",
    detail: `${input.proofType} proof generated (circuit ${circuit}).`
  });

  return proofDoc;
}

/**
 * Re-verify a stored proof cryptographically (snarkjs) AND semantically
 * (public signals must match the current registry state).
 */
export async function verifyProofRecord(input: { proofId: string; verifierId: string }) {
  const proofDoc = await ProofModel.findById(input.proofId);
  if (!proofDoc) throw notFound("Proof not found.");

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

export async function getProof(proofId: string) {
  const proofDoc = await ProofModel.findById(proofId);
  if (!proofDoc) throw notFound("Proof not found.");
  return proofDoc;
}

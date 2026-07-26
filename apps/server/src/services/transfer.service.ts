import { ChallengeModel } from "../models/Challenge.model";
import { LandModel } from "../models/Land.model";
import { MerkleRootModel } from "../models/MerkleRoot.model";
import { ProofModel } from "../models/Proof.model";
import { TransactionModel } from "../models/Transaction.model";
import { buyerBoundChallenge, isFieldElement, landIdToField } from "../utils/field.util";
import { deterministicTxHash } from "../utils/hash.util";
import { proveRootTransition, rebuildRegistryTree } from "./merkle.service";
import { transferLandOnChain, updateRootOnChain } from "./blockchain.service";
import { verifyWithCircuit } from "./zk.service";
import { withRegistryLock } from "../utils/lock.util";
import type { Groth16Proof } from "../types/proof.types";
import { badRequest, notFound } from "../utils/errors.util";

/**
 * Buyer purchases a listed land. Requires a VERIFIED challenge-response
 * proof between this buyer and the seller — the ZK authenticity handshake is
 * mandatory before money changes hands.
 *
 * The buyer chooses a fresh secret in their browser and submits only the
 * derived Poseidon commitments — the secret itself never reaches the server.
 * The land is re-committed to the buyer and ownership moves to them. The land
 * then leaves the active registry tree and becomes a PENDING_APPROVAL
 * re-registration request routed to the authority. The previous owner
 * immediately loses the ability to prove ownership, and the new owner can
 * only prove ownership (or resell) once the authority has re-registered the
 * land in their name.
 */
export async function buyListedLand(input: {
  landId: string;
  buyerId: string;
  buyerWallet: string;
  newLandCommitment: string;
  newAreaCommitment: string;
}) {
  // Serialized with approvals: both mutate the registry tree.
  return withRegistryLock(async () => {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (!land.forSale || land.status !== "LISTED_FOR_SALE") throw badRequest("Land is not listed for sale.");
  if (String(land.ownerId) === input.buyerId) throw badRequest("Owner cannot buy their own land.");
  if (!isFieldElement(input.newLandCommitment)) {
    throw badRequest("newLandCommitment must be a decimal field element (computed in your browser).");
  }
  if (!isFieldElement(input.newAreaCommitment)) {
    throw badRequest("newAreaCommitment must be a decimal field element (computed in your browser).");
  }
  if (input.newLandCommitment === land.landCommitment) {
    throw badRequest("The new commitment must differ from the current one — choose a fresh secret.");
  }
  const duplicateCommitment = await LandModel.findOne({ landCommitment: input.newLandCommitment });
  if (duplicateCommitment) throw badRequest("This commitment is already in use. Choose a different secret.");

  const verifiedChallenge = await ChallengeModel.findOne({
    landId: input.landId,
    buyerId: input.buyerId,
    status: "VERIFIED"
  }).sort({ verifiedAt: -1 });
  if (!verifiedChallenge) {
    throw badRequest(
      "You must first challenge the seller and verify their zero-knowledge ownership proof before buying."
    );
  }

  // The seller's proof was bound to the wallet the buyer used when creating
  // the challenge; ownership can only be transferred to that same wallet.
  if (verifiedChallenge.buyerWallet !== input.buyerWallet.toLowerCase()) {
    throw badRequest(
      "Your wallet differs from the one used for the verified challenge. Re-run the challenge with your current wallet."
    );
  }
  if (!verifiedChallenge.nonceSalt) {
    throw badRequest("This challenge predates buyer-bound nonces. Please create and verify a new challenge.");
  }

  const sellerProof = verifiedChallenge.proofId
    ? await ProofModel.findById(verifiedChallenge.proofId)
    : null;
  if (!sellerProof?.proof || !Array.isArray(sellerProof.publicSignals) || sellerProof.publicSignals.length !== 4) {
    throw badRequest("The verified challenge has no usable seller proof. Please re-run the challenge.");
  }

  // ---- Buy-time re-verification -------------------------------------------
  // The on-chain contract enforces all of this when a chain is configured,
  // but offline mode must not be weaker: re-check the proof cryptographically
  // and semantically at the moment of purchase, not just at challenge time.
  if (sellerProof.usedForTransferAt) {
    throw badRequest("This ownership proof was already used for a transfer. Please re-run the challenge.");
  }
  const signals = sellerProof.publicSignals as string[];
  if (signals[1] !== landIdToField(input.landId)) {
    throw badRequest("The seller's proof is bound to a different land. Please re-run the challenge.");
  }
  const latestRoot = await MerkleRootModel.findOne().sort({ createdAt: -1 });
  if (!latestRoot || signals[2] !== latestRoot.root) {
    throw badRequest(
      "The registry has changed since the challenge was verified, so the seller's proof is stale. Please re-run the challenge."
    );
  }
  if (signals[3] !== buyerBoundChallenge(input.buyerWallet, verifiedChallenge.nonceSalt)) {
    throw badRequest("The seller's proof is not bound to your wallet. Please re-run the challenge.");
  }
  const proofOk = await verifyWithCircuit("challengeProof", sellerProof.proof, signals);
  if (!proofOk) throw badRequest("The seller's proof failed cryptographic verification. Purchase aborted.");

  // Price agreed at challenge time must still be the listed price.
  if (verifiedChallenge.agreedPrice != null && land.salePrice !== verifiedChallenge.agreedPrice) {
    throw badRequest(
      `The sale price changed after your challenge was verified (agreed: ${verifiedChallenge.agreedPrice}, now: ${land.salePrice}). Please re-run the challenge.`
    );
  }
  // --------------------------------------------------------------------------

  const fromOwnerId = land.ownerId;
  const fromOwnerWallet = land.ownerWallet;
  const salePrice = land.salePrice;
  // Captured before re-commitment: needed for the removal transition proof.
  const previousCommitment = land.landCommitment;
  const previousLeafIndex = land.leafIndex as number;

  const blockchainTxHash = await transferLandOnChain(
    input.landId,
    input.buyerWallet,
    verifiedChallenge.nonceSalt,
    sellerProof.proof as Groth16Proof,
    sellerProof.publicSignals
  );

  // The proof is consumed by this transfer (single-use, like the on-chain nullifier).
  sellerProof.usedForTransferAt = new Date();
  await sellerProof.save();

  // Re-commit the land to the buyer's fresh (browser-derived) commitments.
  land.landCommitment = input.newLandCommitment;
  land.areaCommitment = input.newAreaCommitment;
  land.ownerId = input.buyerId as never;
  land.ownerWallet = input.buyerWallet.toLowerCase();
  land.forSale = false;
  land.salePrice = undefined;

  // Authority-gated transfer: the land leaves the active registry tree and
  // becomes a re-registration request the authority must approve before the
  // new owner can prove ownership or resell.
  land.leafIndex = undefined;
  land.merkleRoot = undefined;
  land.pathElements = [];
  land.pathIndices = [];
  land.approvedBy = undefined;
  land.approvedAt = undefined;
  land.status = "PENDING_APPROVAL";
  land.requestNote = `Ownership purchased from ${fromOwnerWallet}; awaiting authority re-registration.`;
  await land.save();

  // Rebuild the tree without this land so the previous owner can no longer prove.
  const snapshot = await rebuildRegistryTree();
  // Prove on-chain that the new root is EXACTLY the old root with this
  // land's commitment removed from its leaf (single-leaf transition).
  const transition = await proveRootTransition({
    path: snapshot.pathFor(previousLeafIndex),
    leafBefore: previousCommitment,
    leafAfter: "0",
    newRoot: snapshot.root
  });
  const rootTxHash = await updateRootOnChain(snapshot.root, transition);
  await MerkleRootModel.create({
    root: snapshot.root,
    leafCount: snapshot.leafCount,
    landIds: (await LandModel.find({ leafIndex: { $ne: null } }).select("landId")).map((item) => item.landId),
    transactionHash: rootTxHash,
    createdBy: input.buyerId
  });

  // Other open challenges against this land are now moot.
  await ChallengeModel.updateMany(
    { landId: input.landId, status: { $in: ["PENDING", "PROOF_SUBMITTED"] } },
    { status: "FAILED", verificationNote: "Land was sold; challenge closed." }
  );

  const transaction = await TransactionModel.create({
    landId: input.landId,
    fromOwner: fromOwnerWallet,
    toOwner: input.buyerWallet.toLowerCase(),
    transactionType: "BUY",
    blockchainTxHash,
    status: "CONFIRMED",
    detail: salePrice
      ? `Sold for ${salePrice}; pending authority re-registration.`
      : "Sold; pending authority re-registration."
  });

  // Re-registration request routed to the authority under the new owner.
  await TransactionModel.create({
    landId: input.landId,
    toOwner: input.buyerWallet.toLowerCase(),
    transactionType: "LAND_REQUESTED",
    blockchainTxHash: deterministicTxHash(`re-register:${input.landId}:${input.buyerWallet}`),
    status: "PENDING",
    detail: "Re-registration request submitted to authority for the new owner."
  });

  return { land: await LandModel.findOne({ landId: input.landId }), transaction, salePrice, fromOwnerId };
  });
}

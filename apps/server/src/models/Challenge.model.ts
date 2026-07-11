import mongoose, { Schema } from "mongoose";

export const CHALLENGE_STATUSES = [
  "PENDING",
  "PROOF_SUBMITTED",
  "VERIFIED",
  "FAILED",
  "DECLINED"
] as const;

const messageSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    body: { type: String, required: true },
    sentAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

/**
 * A buyer's "prove you are the authentic owner" request for a listed land.
 * The nonce is a one-time field element bound into the seller's ZK proof,
 * making the response non-replayable.
 */
const challengeSchema = new Schema(
  {
    landId: { type: String, required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    buyerWallet: { type: String, required: true, lowercase: true },
    sellerWallet: { type: String, required: true, lowercase: true },
    nonce: { type: String, required: true },
    /** One-time bytes32 salt; nonce = keccak256(buyerWallet, nonceSalt) % FIELD_PRIME.
     *  Passed to the contract so it can verify the proof is bound to the buyer. */
    nonceSalt: { type: String },
    /** Sale price snapshotted when the challenge was created; the buy is
     *  rejected if the seller changes the price after verification. */
    agreedPrice: { type: String },
    status: { type: String, enum: CHALLENGE_STATUSES, default: "PENDING", index: true },
    messages: [messageSchema],
    proofId: { type: Schema.Types.ObjectId, ref: "Proof" },
    verifiedAt: { type: Date },
    verificationNote: { type: String }
  },
  { timestamps: true }
);

export const ChallengeModel = mongoose.model("Challenge", challengeSchema);

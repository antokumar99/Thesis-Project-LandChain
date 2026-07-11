import mongoose, { Schema } from "mongoose";
import { PROOF_TYPES } from "../constants/proofTypes";

const proofSchema = new Schema(
  {
    proofType: { type: String, enum: Object.values(PROOF_TYPES), required: true, index: true },
    circuit: { type: String, required: true },
    landId: { type: String, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerWallet: { type: String, required: true, lowercase: true },
    challengeId: { type: Schema.Types.ObjectId, ref: "Challenge" },
    // Raw Groth16 proof object from snarkjs.
    proof: { type: Schema.Types.Mixed, required: true },
    publicSignals: [{ type: String, required: true }],
    // Human-readable labels for each public signal, same order.
    publicSignalLabels: [{ type: String }],
    merkleRoot: { type: String },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    /** Set when this proof is consumed by an ownership transfer; challenge
     *  proofs are single-use (mirrors the on-chain usedNullifiers mapping). */
    usedForTransferAt: { type: Date },
    verificationNote: { type: String },
    transactionHash: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ProofModel = mongoose.model("Proof", proofSchema);

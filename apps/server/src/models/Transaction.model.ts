import mongoose, { Schema } from "mongoose";

export const TRANSACTION_TYPES = [
  "LAND_REQUESTED",
  "LAND_APPROVED",
  "LAND_REJECTED",
  "LIST_FOR_SALE",
  "SALE_CANCELLED",
  "CHALLENGE_CREATED",
  "PROOF_GENERATED",
  "PROOF_VERIFIED",
  "TRANSFER",
  "BUY"
] as const;

const transactionSchema = new Schema(
  {
    landId: { type: String, index: true },
    fromOwner: { type: String, lowercase: true },
    toOwner: { type: String, lowercase: true },
    transactionType: { type: String, enum: TRANSACTION_TYPES, required: true },
    blockchainTxHash: { type: String, required: true },
    status: { type: String, required: true, default: "CONFIRMED" },
    detail: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TransactionModel = mongoose.model("Transaction", transactionSchema);

import mongoose, { Schema } from "mongoose";

export const LAND_STATUSES = [
  "PENDING_APPROVAL",
  "REGISTERED",
  "REJECTED",
  "LISTED_FOR_SALE"
] as const;

const landSchema = new Schema(
  {
    landId: { type: String, required: true, unique: true, index: true },
    plotNumber: { type: String, required: true },
    location: { type: String, required: true },
    areaSqm: { type: Number, required: true, min: 1 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerWallet: { type: String, required: true, lowercase: true, index: true },
    deedHash: { type: String, required: true },
    ipfsCID: { type: String, required: true },
    // Poseidon(landIdField, secretField) — decimal field element string.
    landCommitment: { type: String, required: true, unique: true },
    // Poseidon(areaSqm, areaSalt) — supports area range proofs.
    areaCommitment: { type: String, required: true },
    // Position in the registry Merkle tree; assigned at approval.
    leafIndex: { type: Number },
    merkleRoot: { type: String },
    pathElements: [{ type: String }],
    pathIndices: [{ type: Number }],
    status: { type: String, enum: LAND_STATUSES, default: "PENDING_APPROVAL", index: true },
    requestNote: { type: String },
    rejectionReason: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    forSale: { type: Boolean, default: false },
    salePrice: { type: String }
  },
  { timestamps: true }
);

export const LandModel = mongoose.model("Land", landSchema);

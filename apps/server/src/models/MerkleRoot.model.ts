import mongoose, { Schema } from "mongoose";

const merkleRootSchema = new Schema(
  {
    root: { type: String, required: true, index: true },
    leafCount: { type: Number, required: true },
    landIds: [{ type: String }],
    transactionHash: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const MerkleRootModel = mongoose.model("MerkleRoot", merkleRootSchema);

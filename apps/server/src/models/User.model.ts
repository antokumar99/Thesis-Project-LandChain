import mongoose, { Schema } from "mongoose";
import { ROLES } from "../constants/roles";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    walletAddress: { type: String, required: true, unique: true, lowercase: true },
    role: { type: String, enum: Object.values(ROLES), required: true, default: ROLES.USER },
    nidHash: { type: String, required: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const UserModel = mongoose.model("User", userSchema);

import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger.util";

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (error) {
    logger.error(`MongoDB connection failed for ${env.mongodbUri}`, error);
    throw error;
  }
}

export function getDbStatus() {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return {
    state: states[mongoose.connection.readyState] ?? "unknown",
    name: mongoose.connection.name || null,
    host: mongoose.connection.host || null
  };
}

import type { Express } from "express";
import { sha256Hex } from "./hash.util";

export function fileHash(file?: Express.Multer.File): string {
  if (!file) return sha256Hex(Buffer.from(""));
  return sha256Hex(file.buffer);
}

import { createHash } from "crypto";

export function sha256Hex(value: string | Buffer): string {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

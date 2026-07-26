import crypto from "crypto";
import { ipfsConfig } from "../config/ipfs";

/**
 * Deed documents are encrypted at rest and BEFORE being pinned to IPFS.
 *
 * Why: the deed CID is published on chain, and IPFS content is world-readable
 * by CID. An unencrypted deed contains the owner's name and plot details, so
 * publishing it would defeat the registry's privacy guarantee entirely — a
 * public-ledger observer could read the CID from the contract, fetch the
 * document, and learn exactly who owns which parcel.
 *
 * Scheme: AES-256-GCM with a random 12-byte IV per document, under a
 * server-held key (DEED_ENCRYPTION_KEY). The authority — who is already
 * trusted with identity metadata for legal gatekeeping — can decrypt for
 * review; the public IPFS network sees ciphertext only.
 *
 * Envelope layout: MAGIC(8) || IV(12) || TAG(16) || CIPHERTEXT
 */

const MAGIC = Buffer.from("LCDEED01", "ascii");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH + TAG_LENGTH;

export function deedEncryptionEnabled(): boolean {
  return Boolean(ipfsConfig.deedEncryptionKey);
}

function key(): Buffer {
  const raw = ipfsConfig.deedEncryptionKey;
  if (!raw) throw new Error("DEED_ENCRYPTION_KEY is not configured.");
  const parsed = Buffer.from(raw.replace(/^0x/, ""), "hex");
  if (parsed.length !== 32) {
    throw new Error("DEED_ENCRYPTION_KEY must be 32 bytes (64 hex characters).");
  }
  return parsed;
}

/** True when the buffer carries our encryption envelope. */
export function isEncryptedDeed(data: Buffer): boolean {
  return data.length >= HEADER_LENGTH && data.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptDeed(plaintext: Buffer): Buffer {
  if (!deedEncryptionEnabled()) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Reverse of {@link encryptDeed}. Documents stored before encryption was
 * configured are returned unchanged, so enabling the key does not orphan
 * existing records.
 */
export function decryptDeed(data: Buffer): Buffer {
  if (!isEncryptedDeed(data)) return data;
  if (!deedEncryptionEnabled()) {
    throw new Error("This deed is encrypted but DEED_ENCRYPTION_KEY is not configured.");
  }
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const tag = data.subarray(MAGIC.length + IV_LENGTH, HEADER_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(HEADER_LENGTH)), decipher.final()]);
}

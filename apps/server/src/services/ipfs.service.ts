import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { ipfsConfig } from "../config/ipfs";
import { sha256Hex } from "../utils/hash.util";
import { decryptDeed, encryptDeed } from "../utils/deedCrypto.util";

/**
 * Deed document storage.
 *
 * Documents are ENCRYPTED (AES-256-GCM, see utils/deedCrypto.util) before
 * they are written anywhere. This matters because the deed CID is published
 * on chain and IPFS content is world-readable by CID: pinning a plaintext
 * deed would let any observer read the CID from the contract, fetch the
 * document, and learn who owns the parcel — defeating the registry's whole
 * privacy guarantee. Ciphertext is what reaches IPFS; the authority decrypts
 * for review.
 *
 * Pinata mode (PINATA_JWT set): the ciphertext is pinned to IPFS and the real
 * CID is recorded. A local copy is kept as a serving cache so review works
 * even if the public gateway is slow or rate-limited.
 *
 * Local mode (no PINATA_JWT): the ciphertext is persisted under
 * apps/server/uploads/ keyed by a deterministic `local-<hash>` CID. Either
 * way the bytes are retrievable via GET /api/ipfs/deeds/:cid.
 *
 * The recorded `deedHash` is always the SHA-256 of the ORIGINAL plaintext, so
 * it remains a stable integrity anchor independent of the encryption key.
 */

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

/** CID recorded when a request was submitted without a deed document. */
export const EMPTY_DEED_CID = `local-${sha256Hex(Buffer.from("")).slice(2, 18)}`;

type DeedMeta = { filename: string; mimetype: string; size: number };

/** CIDs are used as filenames: refuse anything that could traverse paths. */
function isSafeCid(cid: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{3,128}$/.test(cid) && !cid.includes("..");
}

async function persistLocally(cid: string, ciphertext: Buffer, file: Express.Multer.File): Promise<void> {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  await fsp.writeFile(path.join(UPLOADS_DIR, cid), ciphertext);
  const meta: DeedMeta = {
    filename: file.originalname || "deed",
    mimetype: file.mimetype || "application/octet-stream",
    size: file.size
  };
  await fsp.writeFile(path.join(UPLOADS_DIR, `${cid}.json`), JSON.stringify(meta));
}

export async function uploadDeedToIpfs(file?: Express.Multer.File): Promise<{ cid: string; deedHash: string }> {
  const buffer = file?.buffer ?? Buffer.from("");
  // Integrity anchor over the ORIGINAL document, not the ciphertext.
  const deedHash = sha256Hex(buffer);

  if (!file) return { cid: EMPTY_DEED_CID, deedHash };

  // Encrypt before the bytes touch disk or the IPFS network.
  const ciphertext = encryptDeed(buffer);

  if (!ipfsConfig.pinataJwt) {
    const cid = `local-${deedHash.slice(2, 18)}`;
    await persistLocally(cid, ciphertext, file);
    return { cid, deedHash };
  }

  const arrayBuffer = ciphertext.buffer.slice(
    ciphertext.byteOffset,
    ciphertext.byteOffset + ciphertext.byteLength
  ) as ArrayBuffer;
  const formData = new FormData();
  // Opaque name: the pinned object must not leak the original filename either.
  formData.append("file", new Blob([arrayBuffer]), `${deedHash.slice(2, 18)}.enc`);
  formData.append("pinataMetadata", JSON.stringify({ name: "landchain-deed" }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${ipfsConfig.pinataJwt}` },
    body: formData
  });

  if (!response.ok) throw new Error(`IPFS upload failed: ${response.statusText}`);
  const json = (await response.json()) as { IpfsHash: string };
  // Cache locally too, so deed review never depends on gateway availability.
  await persistLocally(json.IpfsHash, ciphertext, file);
  return { cid: json.IpfsHash, deedHash };
}

export type DeedDocument = { data: Buffer; filename: string; mimetype: string };

/**
 * Fetch the deed bytes for a CID: local store first, public IPFS gateway as
 * fallback for real CIDs (e.g. records created on another instance).
 * Returns null when no document exists (including the no-deed sentinel).
 */
export async function getDeedDocument(cid: string): Promise<DeedDocument | null> {
  if (!isSafeCid(cid) || cid === EMPTY_DEED_CID) return null;

  const localPath = path.join(UPLOADS_DIR, cid);
  if (fs.existsSync(localPath)) {
    let meta: DeedMeta = { filename: "deed", mimetype: "application/octet-stream", size: 0 };
    try {
      meta = JSON.parse(await fsp.readFile(`${localPath}.json`, "utf8"));
    } catch {
      /* metadata sidecar missing: serve with generic type */
    }
    const stored = await fsp.readFile(localPath);
    return { data: decryptDeed(stored), filename: meta.filename, mimetype: meta.mimetype };
  }

  // Real IPFS CID not cached locally: proxy from the configured gateway. The
  // fetched object is ciphertext, so it must be decrypted before serving.
  if (!cid.startsWith("local-") && ipfsConfig.gateway) {
    try {
      const response = await fetch(`${ipfsConfig.gateway}/${cid}`);
      if (!response.ok) return null;
      const stored = Buffer.from(await response.arrayBuffer());
      const data = decryptDeed(stored);
      // A decrypted deed's type is unknown from the gateway headers; sniff the
      // PDF magic and otherwise fall back to a generic type.
      const mimetype = data.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : "application/octet-stream";
      return { data, filename: "deed", mimetype };
    } catch {
      return null;
    }
  }

  return null;
}

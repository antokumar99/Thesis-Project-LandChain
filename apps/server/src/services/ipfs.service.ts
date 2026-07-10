import { ipfsConfig } from "../config/ipfs";
import { sha256Hex } from "../utils/hash.util";

export async function uploadDeedToIpfs(file?: Express.Multer.File): Promise<{ cid: string; deedHash: string }> {
  const buffer = file?.buffer ?? Buffer.from("");
  const deedHash = sha256Hex(buffer);

  if (!ipfsConfig.pinataJwt || !file) {
    return { cid: `local-${deedHash.slice(2, 18)}`, deedHash };
  }

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const formData = new FormData();
  formData.append("file", new Blob([arrayBuffer]), file.originalname);

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${ipfsConfig.pinataJwt}` },
    body: formData
  });

  if (!response.ok) throw new Error(`IPFS upload failed: ${response.statusText}`);
  const json = (await response.json()) as { IpfsHash: string };
  return { cid: json.IpfsHash, deedHash };
}

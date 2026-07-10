import crypto from "crypto";
import { ethers } from "ethers";

export function sha256Hex(input: Buffer | string): string {
  return `0x${crypto.createHash("sha256").update(input).digest("hex")}`;
}

export function landCommitment(landId: string, ownerSecret: string): string {
  return ethers.solidityPackedKeccak256(["string", "string"], [landId, ownerSecret]);
}

export function landHash(landId: string): string {
  return ethers.id(landId);
}

export function deterministicTxHash(seed: string): string {
  return ethers.id(`${seed}:${Date.now()}`);
}

export function proofNullifier(landId: string, ownerSecret: string): string {
  return ethers.solidityPackedKeccak256(["string", "string", "string"], ["landchain-nullifier", landId, ownerSecret]);
}

export function proofStatementHash(input: {
  landId: string;
  commitment: string;
  merkleRoot: string;
  nullifierHash: string;
}): string {
  return ethers.solidityPackedKeccak256(
    ["string", "string", "bytes32", "bytes32", "bytes32"],
    ["landchain-zk-proof", input.landId, input.commitment, input.merkleRoot, input.nullifierHash]
  );
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(testDir, "../../circuits");

export const TREE_DEPTH = 10;

export type OnChainProof = {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  publicSignals: bigint[];
  rootBytes32: string;
};

/**
 * Generates a REAL challenge-response Groth16 proof using the compiled
 * circuit artifacts from the circuits workspace, formatted for on-chain
 * verification. Public signals: [responseNullifier, landIdField, merkleRoot, challenge].
 */
export async function generateChallengeProof(): Promise<OnChainProof> {
  const poseidon = await buildPoseidon();
  const H = (a: bigint | string, b: bigint | string) => poseidon.F.toString(poseidon([BigInt(a), BigInt(b)]));

  const landIdField = "1234567890123456789";
  const ownerSecret = "9876543210987654321";
  const challenge = "5555555555555555555";
  const commitment = H(landIdField, ownerSecret);

  // Single-leaf sparse tree at index 0.
  const zeros: string[] = ["0"];
  for (let i = 0; i < TREE_DEPTH; i++) zeros.push(H(zeros[i], zeros[i]));
  const pathElements: string[] = [];
  const pathIndices: number[] = [];
  let node = commitment;
  for (let level = 0; level < TREE_DEPTH; level++) {
    pathElements.push(zeros[level]);
    pathIndices.push(0);
    node = H(node, zeros[level]);
  }
  const merkleRoot = node;

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { ownerSecret, pathElements, pathIndices, landIdField, merkleRoot, challenge },
    path.join(circuitsDir, "build", "challengeProof_js", "challengeProof.wasm"),
    path.join(circuitsDir, "keys", "challengeProof_final.zkey")
  );

  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    publicSignals: publicSignals.map(BigInt),
    rootBytes32: `0x${BigInt(merkleRoot).toString(16).padStart(64, "0")}`
  };
}

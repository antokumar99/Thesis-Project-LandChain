import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { ethers } from "ethers";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(testDir, "../../circuits");

export const TREE_DEPTH = 10;

/** BN254 scalar field prime used by circom/snarkjs. */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Field encoding of the test land id (must be registered on-chain with the land). */
export const LAND_ID_FIELD = 1234567890123456789n;

export type OnChainProof = {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  publicSignals: bigint[];
  rootBytes32: string;
  landIdField: bigint;
  challengeSalt: string;
};

/**
 * Challenge nonce bound to a buyer: keccak256(buyer, salt) reduced into the
 * scalar field. Must mirror LandRegistry.verifyAndTransfer's derivation.
 */
export function challengeFor(buyer: string, salt: string): bigint {
  return BigInt(ethers.solidityPackedKeccak256(["address", "bytes32"], [buyer, salt])) % SNARK_SCALAR_FIELD;
}

/**
 * Generates a REAL challenge-response Groth16 proof using the compiled
 * circuit artifacts from the circuits workspace, formatted for on-chain
 * verification. Public signals: [responseNullifier, landIdField, merkleRoot, challenge].
 *
 * The challenge is derived from the buyer's address and a one-time salt so
 * the proof is only valid for that buyer.
 */
export async function generateChallengeProof(buyer: string, salt?: string): Promise<OnChainProof> {
  // Proof generation is deterministic in its inputs, so cache it on disk:
  // repeated test runs (and CI) skip the expensive Groth16 proving step.
  const cacheFile = path.join(testDir, ".challenge-proof-cache.json");
  const cacheKey = salt === undefined ? undefined : `${buyer.toLowerCase()}:${salt}`;
  if (cacheKey !== undefined && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (cached.key === cacheKey) {
        const v = cached.value;
        return {
          a: [BigInt(v.a[0]), BigInt(v.a[1])],
          b: [
            [BigInt(v.b[0][0]), BigInt(v.b[0][1])],
            [BigInt(v.b[1][0]), BigInt(v.b[1][1])]
          ],
          c: [BigInt(v.c[0]), BigInt(v.c[1])],
          publicSignals: v.publicSignals.map(BigInt),
          rootBytes32: v.rootBytes32,
          landIdField: BigInt(v.landIdField),
          challengeSalt: v.challengeSalt
        };
      }
    } catch {
      // Corrupt cache: fall through and regenerate.
    }
  }

  const poseidon = await buildPoseidon();
  const H = (a: bigint | string, b: bigint | string) => poseidon.F.toString(poseidon([BigInt(a), BigInt(b)]));

  const landIdField = LAND_ID_FIELD.toString();
  const ownerSecret = "9876543210987654321";
  const challengeSalt = salt ?? ethers.hexlify(ethers.randomBytes(32));
  const challenge = challengeFor(buyer, challengeSalt).toString();
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

  const result: OnChainProof = {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    publicSignals: publicSignals.map(BigInt),
    rootBytes32: `0x${BigInt(merkleRoot).toString(16).padStart(64, "0")}`,
    landIdField: LAND_ID_FIELD,
    challengeSalt
  };

  if (cacheKey !== undefined) {
    const v = {
      a: result.a.map(String),
      b: result.b.map((row) => row.map(String)),
      c: result.c.map(String),
      publicSignals: result.publicSignals.map(String),
      rootBytes32: result.rootBytes32,
      landIdField: result.landIdField.toString(),
      challengeSalt: result.challengeSalt
    };
    fs.writeFileSync(cacheFile, JSON.stringify({ key: cacheKey, value: v }, null, 2));
  }

  return result;
}

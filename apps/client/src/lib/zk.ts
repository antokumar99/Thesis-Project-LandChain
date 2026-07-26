/**
 * Client-side zero-knowledge toolkit. EVERYTHING secret happens here, in the
 * owner's browser:
 *
 *  - the owner secret is turned into field elements and Poseidon commitments
 *    locally (poseidon-lite uses the same constants as circomlib);
 *  - Groth16 proofs are generated locally with the snarkjs wasm prover using
 *    the public circuit artifacts served by the API;
 *  - proofs received from a counterparty can be verified locally against the
 *    published verification key, so even verification does not require
 *    trusting the server.
 *
 * The server only ever sees commitments, proofs and public signals — it can
 * verify but never link an owner to a secret.
 */
import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import { API_URL } from "./constants";
import type { Groth16Proof } from "../types/proof.types";

/** BN254 scalar field prime used by circom/snarkjs. */
export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Map an arbitrary string to a field element (decimal string). MUST mirror apps/server/src/utils/field.util.ts. */
export function toField(input: string): string {
  return (BigInt(ethers.id(input)) % FIELD_PRIME).toString();
}

export function landIdToField(landId: string): string {
  return toField(`landchain:land:${landId}`);
}

export function secretToField(landId: string, ownerSecret: string): string {
  return toField(`landchain:secret:${landId}:${ownerSecret}`);
}

export function areaSaltField(landId: string, ownerSecret: string): string {
  return toField(`landchain:area-salt:${landId}:${ownerSecret}`);
}

/**
 * Generate a fresh owner secret with 256 bits of entropy from the platform
 * CSPRNG.
 *
 * This MUST NOT be a user-chosen passphrase. Registry commitments are
 * Poseidon(landIdField, secretField) and are visible to the operator (and,
 * via the anchored tree, derived from published state), so a low-entropy
 * secret would be recoverable by offline dictionary search: an attacker
 * simply hashes candidate passphrases until the commitment matches. Drawing
 * the secret from the CSPRNG makes that search infeasible and is what lets
 * the system claim that opening a commitment reduces to inverting Poseidon.
 *
 * Returned as a 0x-prefixed 64-hex-character string: this is the owner's
 * ONLY credential and cannot be recovered if lost.
 */
export function generateOwnerSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Owner secrets must be full-entropy CSPRNG values, not typed passphrases. */
export function isValidOwnerSecret(secret: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(secret.trim());
}

/** Poseidon hash of two field elements; inputs and output are decimal strings. */
export function poseidonHash2(left: string, right: string): string {
  return poseidon2([BigInt(left), BigInt(right)]).toString();
}

/** The commitments the registry stores instead of anything secret-derived. */
export function computeCommitments(landId: string, ownerSecret: string, areaSqm: number) {
  const landIdField = landIdToField(landId);
  const secretField = secretToField(landId, ownerSecret);
  const landCommitment = poseidonHash2(landIdField, secretField);
  const areaCommitment = poseidonHash2(String(Math.floor(areaSqm)), areaSaltField(landId, ownerSecret));
  return { landIdField, secretField, landCommitment, areaCommitment };
}

export type CircuitName = "commitmentProof" | "landOwnership" | "challengeProof" | "areaRange";

const artifactCache = new Map<string, Promise<Uint8Array>>();

async function fetchArtifact(circuit: CircuitName, kind: "wasm" | "zkey"): Promise<Uint8Array> {
  const url = `${API_URL}/zk/artifacts/${circuit}/${kind}`;
  let cached = artifactCache.get(url);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download circuit ${kind} for ${circuit} (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    })();
    artifactCache.set(url, cached);
  }
  return cached;
}

const vkeyCache = new Map<string, Promise<unknown>>();

async function fetchVkey(circuit: CircuitName): Promise<unknown> {
  const url = `${API_URL}/zk/artifacts/${circuit}/vkey`;
  let cached = vkeyCache.get(url);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download verification key for ${circuit} (${response.status}).`);
      return response.json();
    })();
    vkeyCache.set(url, cached);
  }
  return cached;
}

/**
 * Generate a Groth16 proof entirely in the browser. The witness (including
 * the owner secret) never leaves this function.
 */
export async function proveInBrowser(
  circuit: CircuitName,
  input: Record<string, unknown>
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  const snarkjs = await import("snarkjs");
  const [wasm, zkey] = await Promise.all([fetchArtifact(circuit, "wasm"), fetchArtifact(circuit, "zkey")]);
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
    return { proof: proof as Groth16Proof, publicSignals: publicSignals as string[] };
  } catch (error) {
    if (error instanceof Error && /Assert Failed|Error in template/i.test(error.message)) {
      throw new Error("The statement is not true for this land (or the secret is wrong), so no proof can be generated.");
    }
    throw error;
  }
}

/** Verify a Groth16 proof locally — no trust in the server required. */
export async function verifyInBrowser(
  circuit: CircuitName,
  proof: Groth16Proof,
  publicSignals: string[]
): Promise<boolean> {
  const snarkjs = await import("snarkjs");
  const vkey = await fetchVkey(circuit);
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

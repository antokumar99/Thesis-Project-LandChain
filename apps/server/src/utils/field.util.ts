import crypto from "crypto";
import { ethers } from "ethers";

/** BN254 scalar field prime used by circom/snarkjs. */
export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Map an arbitrary string to a field element (decimal string). */
export function toField(input: string): string {
  return (BigInt(ethers.id(input)) % FIELD_PRIME).toString();
}

/** Field encoding of a land id. */
export function landIdToField(landId: string): string {
  return toField(`landchain:land:${landId}`);
}

/** Field encoding of an owner secret, scoped to a land so reuse across lands is not linkable. */
export function secretToField(landId: string, ownerSecret: string): string {
  return toField(`landchain:secret:${landId}:${ownerSecret}`);
}

/** Deterministic salt for the area commitment, recoverable from the owner secret. */
export function areaSaltField(landId: string, ownerSecret: string): string {
  return toField(`landchain:area-salt:${landId}:${ownerSecret}`);
}

/** Cryptographically random field element (decimal string) for challenge nonces. */
export function randomFieldElement(): string {
  const bytes = crypto.randomBytes(31); // < 2^248 << FIELD_PRIME
  return (BigInt(`0x${bytes.toString("hex")}`) % FIELD_PRIME).toString();
}

/** One-time random salt (0x-prefixed bytes32) for buyer-bound challenge nonces. */
export function randomChallengeSalt(): string {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Challenge nonce cryptographically bound to the buyer's wallet:
 * keccak256(buyer, salt) reduced into the scalar field. MUST mirror
 * LandRegistry.verifyAndTransfer's on-chain derivation so the contract can
 * confirm the seller's proof was made for THIS buyer.
 */
export function buyerBoundChallenge(buyerWallet: string, salt: string): string {
  const packed = ethers.solidityPackedKeccak256(["address", "bytes32"], [ethers.getAddress(buyerWallet), salt]);
  return (BigInt(packed) % FIELD_PRIME).toString();
}

export function isFieldElement(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) < FIELD_PRIME;
  } catch {
    return false;
  }
}

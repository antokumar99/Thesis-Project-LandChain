import { getAddress, isAddress } from "ethers";
import { getRegistryContract } from "../config/blockchain";
import { deterministicTxHash, landHash } from "../utils/hash.util";
import { logger } from "../utils/logger.util";
import { badRequest } from "../utils/errors.util";
import type { Groth16Proof } from "../types/proof.types";

/**
 * Normalise a wallet string into a checksummed address the contract layer can
 * accept. On a local chain (chainId 31337) ethers has no ENS, so any argument
 * that is not a valid 0x-address makes it fall back to ENS resolution and throw
 * `network does not support ENS`. Guarding here turns that into a clear error
 * instead of a crash mid-purchase.
 */
function toAddress(wallet: string): string {
  if (!wallet || !isAddress(wallet)) {
    throw new Error(
      `Invalid wallet address "${wallet}". A valid 0x-prefixed 40-hex Ethereum address is required.`
    );
  }
  return getAddress(wallet);
}

function toProofArgs(proof: Groth16Proof) {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ],
    c: [proof.pi_c[0], proof.pi_c[1]]
  };
}

/** Poseidon roots/signals are decimal field elements; the contract wants bytes32. */
function toBytes32(value: string): string {
  if (value.startsWith("0x")) return value;
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

export async function updateRootOnChain(root: string): Promise<string> {
  const registry = getRegistryContract();
  const fallback = deterministicTxHash(`root:${root}`);
  if (!registry) return fallback;

  try {
    const tx = await registry.updateMerkleRoot(toBytes32(root));
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (error) {
    logger.warn(`updateRootOnChain failed, recording local tx hash instead: ${(error as Error).message}`);
    return fallback;
  }
}

export async function registerLandOnChain(
  landId: string,
  ownerWallet: string,
  cid: string,
  root: string,
  landIdField: string
): Promise<string> {
  const registry = getRegistryContract();
  const fallback = deterministicTxHash(`register:${landId}:${ownerWallet}:${root}`);
  if (!registry) return fallback;

  try {
    // A land that was sold and is now being re-approved already has an
    // on-chain record; registerLand would revert with LAND_EXISTS and the new
    // root would silently never be anchored. In that case anchor the root via
    // updateMerkleRoot instead.
    const existing = await registry.lands(landHash(landId));
    if (existing.exists) {
      const tx = await registry.updateMerkleRoot(toBytes32(root));
      const receipt = await tx.wait();
      return receipt.hash;
    }

    const tx = await registry.registerLand(landHash(landId), toAddress(ownerWallet), cid, toBytes32(root), landIdField);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (error) {
    logger.warn(`registerLandOnChain failed, recording local tx hash instead: ${(error as Error).message}`);
    return fallback;
  }
}

/**
 * Submit the ZK-gated ownership transfer on-chain.
 *
 * Unlike registration/root anchoring, a failure here is NOT swallowed: the
 * on-chain Groth16 verification is the security gate of the whole transfer,
 * so a revert (invalid proof, stale root, wrong buyer, replay, disputed land)
 * must abort the purchase instead of being recorded as a fake success.
 * Only when no chain is configured at all (local dev without a node) do we
 * fall back to a deterministic local hash.
 */
export async function transferLandOnChain(
  landId: string,
  buyerWallet: string,
  challengeSalt: string,
  proof: Groth16Proof,
  publicSignals: string[]
): Promise<string> {
  const registry = getRegistryContract();
  if (!registry) {
    return deterministicTxHash(`transfer:${landId}:${buyerWallet}:${publicSignals.join(":")}`);
  }

  try {
    const args = toProofArgs(proof);
    const tx = await registry.verifyAndTransfer(
      landHash(landId),
      toAddress(buyerWallet),
      challengeSalt,
      args.a,
      args.b,
      args.c,
      publicSignals
    );
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (error) {
    const err = error as Error & { reason?: string; shortMessage?: string };
    const reason = err.reason ?? err.shortMessage ?? err.message;
    logger.warn(`transferLandOnChain reverted: ${reason}`);
    throw badRequest(`On-chain transfer was rejected: ${reason}`);
  }
}

// Ops helper: one-time root bootstrap for a freshly deployed registry that is
// being pointed at an existing off-chain registry state. Regular root updates
// MUST go through updateMerkleRoot with a Groth16 transition proof (the
// backend does this automatically on approval/transfer); this script cannot
// produce such a proof and therefore only supports the bootstrap case.
import { network } from "hardhat";

const { ethers } = await network.create();
const registryAddress = process.env.LAND_REGISTRY_ADDRESS;
const root = process.env.MERKLE_ROOT;

if (!registryAddress || !root) {
  throw new Error("LAND_REGISTRY_ADDRESS and MERKLE_ROOT are required.");
}

const registry = await ethers.getContractAt("LandRegistry", registryAddress);
const tx = await registry.bootstrapRoot(root);
await tx.wait();

console.log(`Merkle root bootstrapped: ${root}`);

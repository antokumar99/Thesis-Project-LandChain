import { network } from "hardhat";

const { ethers } = await network.create();
const registryAddress = process.env.LAND_REGISTRY_ADDRESS;
const root = process.env.MERKLE_ROOT;

if (!registryAddress || !root) {
  throw new Error("LAND_REGISTRY_ADDRESS and MERKLE_ROOT are required.");
}

const registry = await ethers.getContractAt("LandRegistry", registryAddress);
const tx = await registry.updateMerkleRoot(root);
await tx.wait();

console.log(`Merkle root updated: ${root}`);

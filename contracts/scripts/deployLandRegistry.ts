import { network } from "hardhat";

const { ethers } = await network.create();
const [authority] = await ethers.getSigners();
const verifierAddress = process.env.VERIFIER_ADDRESS;
const rootVerifierAddress = process.env.ROOT_VERIFIER_ADDRESS;

if (!verifierAddress || !rootVerifierAddress) {
  throw new Error("VERIFIER_ADDRESS and ROOT_VERIFIER_ADDRESS are required.");
}

const registry = await ethers.deployContract("LandRegistry", [authority.address, verifierAddress, rootVerifierAddress]);
await registry.waitForDeployment();

console.log(`LandRegistry deployed to ${await registry.getAddress()}`);

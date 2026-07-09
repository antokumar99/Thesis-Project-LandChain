import { network } from "hardhat";

const { ethers } = await network.create();
const [authority] = await ethers.getSigners();
const verifierAddress = process.env.VERIFIER_ADDRESS;

if (!verifierAddress) {
  throw new Error("VERIFIER_ADDRESS is required.");
}

const registry = await ethers.deployContract("LandRegistry", [authority.address, verifierAddress]);
await registry.waitForDeployment();

console.log(`LandRegistry deployed to ${await registry.getAddress()}`);

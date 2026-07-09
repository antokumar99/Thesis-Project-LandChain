import { network } from "hardhat";

const { ethers } = await network.create();
const [authority] = await ethers.getSigners();

const verifier = await ethers.deployContract("Verifier");
await verifier.waitForDeployment();

const registry = await ethers.deployContract("LandRegistry", [authority.address, await verifier.getAddress()]);
await registry.waitForDeployment();

console.log(`Verifier deployed to ${await verifier.getAddress()}`);
console.log(`LandRegistry deployed to ${await registry.getAddress()}`);

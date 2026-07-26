import { network } from "hardhat";

const { ethers } = await network.create();
const [authority] = await ethers.getSigners();

const verifier = await ethers.deployContract("Verifier");
await verifier.waitForDeployment();

const rootVerifier = await ethers.deployContract("RootVerifier");
await rootVerifier.waitForDeployment();

const registry = await ethers.deployContract("LandRegistry", [
  authority.address,
  await verifier.getAddress(),
  await rootVerifier.getAddress()
]);
await registry.waitForDeployment();

console.log(`Verifier deployed to ${await verifier.getAddress()}`);
console.log(`RootVerifier deployed to ${await rootVerifier.getAddress()}`);
console.log(`LandRegistry deployed to ${await registry.getAddress()}`);

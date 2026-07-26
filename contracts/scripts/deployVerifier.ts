import { network } from "hardhat";

const { ethers } = await network.create();
const verifier = await ethers.deployContract("Verifier");
await verifier.waitForDeployment();

const rootVerifier = await ethers.deployContract("RootVerifier");
await rootVerifier.waitForDeployment();

console.log(`Verifier deployed to ${await verifier.getAddress()}`);
console.log(`RootVerifier deployed to ${await rootVerifier.getAddress()}`);

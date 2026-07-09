import { network } from "hardhat";

const { ethers } = await network.create();
const verifier = await ethers.deployContract("Verifier");
await verifier.waitForDeployment();

console.log(`Verifier deployed to ${await verifier.getAddress()}`);

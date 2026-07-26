/**
 * Gas benchmark for the on-chain protocol, using REAL Groth16 proofs.
 * Measures deployment plus every state-changing operation of LandRegistry.
 *
 * Run:  npx hardhat run scripts/benchmark.ts            (in-process EVM)
 *       npx hardhat run scripts/benchmark.ts --network sepolia
 */
import { network } from "hardhat";
import {
  generateChallengeProof,
  generateInsertionTransition,
  LAND_ID_FIELD
} from "../test/zkHelpers.js";

const { ethers } = await network.create();
const [authority, , buyer] = await ethers.getSigners();

type Row = { operation: string; gasUsed: bigint };
const rows: Row[] = [];

async function record(operation: string, txPromise: Promise<{ wait(): Promise<{ gasUsed: bigint } | null> }>) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  rows.push({ operation, gasUsed: receipt?.gasUsed ?? 0n });
}

console.log("Generating Groth16 proofs (cached after first run)...");
const zk = await generateChallengeProof(buyer.address, ethers.id("landchain-benchmark-salt"));
const transition = await generateInsertionTransition();

const verifier = await ethers.deployContract("Verifier");
const verifierReceipt = await verifier.deploymentTransaction()!.wait();
rows.push({ operation: "deploy Verifier (challenge circuit)", gasUsed: verifierReceipt!.gasUsed });

const rootVerifier = await ethers.deployContract("RootVerifier");
const rootVerifierReceipt = await rootVerifier.deploymentTransaction()!.wait();
rows.push({ operation: "deploy RootVerifier (transition circuit)", gasUsed: rootVerifierReceipt!.gasUsed });

const registry = await ethers.deployContract("LandRegistry", [
  authority.address,
  await verifier.getAddress(),
  await rootVerifier.getAddress()
]);
const registryReceipt = await registry.deploymentTransaction()!.wait();
rows.push({ operation: "deploy LandRegistry", gasUsed: registryReceipt!.gasUsed });

const landHash = ethers.id("LAND-BENCH-001");
await record("registerLand", registry.registerLand(landHash, "QmU95zh2t7JR1RRx6d2C3vCZfwoJpUBN6VdVxsGk6Ptvkm", LAND_ID_FIELD));
await record(
  "updateMerkleRoot (Groth16 transition verify)",
  registry.updateMerkleRoot(transition.newRootBytes32, {
    a: transition.a,
    b: transition.b,
    c: transition.c,
    signals: transition.signals
  })
);
await record(
  "verifyAndTransfer (Groth16 ownership verify)",
  registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
);
await record("markDisputed", registry.markDisputed(landHash));

console.log("\n| Operation | Gas used |");
console.log("|---|---|");
for (const row of rows) console.log(`| ${row.operation} | ${row.gasUsed.toLocaleString("en-US")} |`);

const feeData = await ethers.provider.getFeeData();
const gasPrice = feeData.gasPrice ?? 0n;
if (gasPrice > 0n) {
  console.log(`\nCurrent network gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  for (const row of rows.filter((r) => r.operation.includes("verify"))) {
    console.log(
      `  ${row.operation}: ~${ethers.formatEther(row.gasUsed * gasPrice)} ETH at current price`
    );
  }
}

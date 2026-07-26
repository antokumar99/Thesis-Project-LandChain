/**
 * LIVE Sepolia gas measurement for the paper's evaluation table.
 *
 * Uses an already-deployed spare LandRegistry (BENCH_REGISTRY_ADDRESS) so the
 * production registry's state is untouched. Executes each state-changing
 * operation once with REAL Groth16 proofs and reports gas used + the actual
 * fee paid on Sepolia. Deployment gas is intrinsic to the bytecode (identical
 * on every EVM network), so it is measured by `npm run benchmark` locally.
 *
 * Cost: ~750k gas total (well under 0.002 SepETH at typical prices).
 * Run:  npx hardhat run scripts/sepoliaGasBenchmark.ts --network sepolia
 */
import { network } from "hardhat";
import {
  generateChallengeProof,
  generateInsertionTransition,
  LAND_ID_FIELD
} from "../test/zkHelpers.js";

const { ethers } = await network.create();
const [authority] = await ethers.getSigners();

const REGISTRY = process.env.BENCH_REGISTRY_ADDRESS ?? "0x169653C8c93C59c888c0Dad323381D3434511437";
const registry = await ethers.getContractAt("LandRegistry", REGISTRY);

console.log(`Sepolia gas benchmark against spare registry ${REGISTRY}`);
console.log(`authority/sender: ${authority.address}`);
const startBalance = await ethers.provider.getBalance(authority.address);
console.log(`balance: ${ethers.formatEther(startBalance)} SepETH\n`);

const currentRoot = await registry.latestMerkleRoot();
if (currentRoot !== ethers.ZeroHash) {
  throw new Error(`Spare registry already has a root anchored (${currentRoot}); use a fresh deployment.`);
}

// Same buyer/salt as the test suite so the cached proofs are reused.
const buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const salt = ethers.id("landchain-test-salt");
console.log("Loading Groth16 proofs (cached)...");
const zk = await generateChallengeProof(buyer, salt);
const transition = await generateInsertionTransition();

type Row = { operation: string; gasUsed: bigint; feeWei: bigint; txHash: string };
const rows: Row[] = [];

async function record(operation: string, txPromise: Promise<{ hash: string; wait(): Promise<unknown> }>) {
  process.stdout.write(`  ${operation} ... `);
  const tx = await txPromise;
  const receipt = (await tx.wait()) as { gasUsed: bigint; gasPrice: bigint; hash: string } | null;
  if (!receipt) throw new Error(`${operation}: no receipt`);
  rows.push({ operation, gasUsed: receipt.gasUsed, feeWei: receipt.gasUsed * receipt.gasPrice, txHash: receipt.hash });
  console.log(`gas=${receipt.gasUsed} tx=${receipt.hash}`);
}

const landHash = ethers.id(`LAND-SEPOLIA-BENCH-${Date.now()}`);
await record("registerLand", registry.registerLand(landHash, "QmU95zh2t7JR1RRx6d2C3vCZfwoJpUBN6VdVxsGk6Ptvkm", LAND_ID_FIELD));
await record(
  "updateMerkleRoot (on-chain Groth16 root-transition verify)",
  registry.updateMerkleRoot(transition.newRootBytes32, {
    a: transition.a,
    b: transition.b,
    c: transition.c,
    signals: transition.signals
  })
);
await record(
  "verifyAndTransfer (on-chain Groth16 ownership verify)",
  registry.verifyAndTransfer(landHash, buyer, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
);
await record("markDisputed", registry.markDisputed(landHash));

const endBalance = await ethers.provider.getBalance(authority.address);

console.log("\n| Operation | Gas used | Fee paid (ETH) | Sepolia tx |");
console.log("|---|---|---|---|");
for (const row of rows) {
  console.log(
    `| ${row.operation} | ${row.gasUsed.toLocaleString("en-US")} | ${ethers.formatEther(row.feeWei)} | ${row.txHash} |`
  );
}
console.log(`\nTotal spent: ${ethers.formatEther(startBalance - endBalance)} SepETH`);
console.log(`Remaining:   ${ethers.formatEther(endBalance)} SepETH`);

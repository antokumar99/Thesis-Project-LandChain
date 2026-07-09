import { expect } from "chai";
import { network } from "hardhat";
import { generateChallengeProof, type OnChainProof } from "./zkHelpers.js";

const { ethers } = await network.create();

describe("Verifier (real Groth16, challenge-response circuit)", function () {
  let zk: OnChainProof;

  before(async function () {
    this.timeout(120000);
    zk = await generateChallengeProof();
  });

  it("accepts a valid snarkjs-generated proof", async function () {
    const verifier = await ethers.deployContract("Verifier");
    expect(await verifier.verifyProof(zk.a, zk.b, zk.c, zk.publicSignals)).to.equal(true);
  });

  it("rejects a proof with a tampered public signal", async function () {
    const verifier = await ethers.deployContract("Verifier");
    const tampered = [...zk.publicSignals];
    tampered[3] = tampered[3] + 1n; // different challenge nonce
    expect(await verifier.verifyProof(zk.a, zk.b, zk.c, tampered)).to.equal(false);
  });

  it("rejects public signals of the wrong length", async function () {
    const verifier = await ethers.deployContract("Verifier");
    expect(await verifier.verifyProof(zk.a, zk.b, zk.c, zk.publicSignals.slice(0, 3))).to.equal(false);
  });
});

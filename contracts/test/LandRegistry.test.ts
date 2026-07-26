import { expect } from "chai";
import { network } from "hardhat";
import {
  generateChallengeProof,
  generateInsertionTransition,
  LAND_ID_FIELD,
  type OnChainProof,
  type OnChainTransition
} from "./zkHelpers.js";

const { ethers } = await network.create();

describe("LandRegistry", function () {
  let zk: OnChainProof;
  let transition: OnChainTransition;
  let buyerAddress: string;

  before(async function () {
    this.timeout(240000);
    const [, , buyer] = await ethers.getSigners();
    buyerAddress = buyer.address;
    // Real Groth16 proofs: the challenge proof is bound to the buyer's
    // address; the transition proof inserts the same commitment into the
    // empty tree, so transition.newRootBytes32 === zk.rootBytes32.
    zk = await generateChallengeProof(buyerAddress, ethers.id("landchain-test-salt"));
    transition = await generateInsertionTransition();
  });

  async function deployFixture() {
    const [authority, owner, buyer, outsider] = await ethers.getSigners();
    const verifier = await ethers.deployContract("Verifier");
    const rootVerifier = await ethers.deployContract("RootVerifier");
    const registry = await ethers.deployContract("LandRegistry", [
      authority.address,
      await verifier.getAddress(),
      await rootVerifier.getAddress()
    ]);
    const landHash = ethers.id("LAND-001");

    return { authority, owner, buyer, outsider, verifier, rootVerifier, registry, landHash };
  }

  function transitionArg(t: OnChainTransition) {
    return { a: t.a, b: t.b, c: t.c, signals: t.signals };
  }

  it("lets the authority register land and anchor a proven root transition", async function () {
    const { registry, landHash } = await deployFixture();

    await expect(registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD))
      .to.emit(registry, "LandRegistered")
      .withArgs(landHash, "bafy-demo");

    await expect(registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition)))
      .to.emit(registry, "MerkleRootUpdated");

    expect(await registry.latestMerkleRoot()).to.equal(transition.newRootBytes32);
    const record = await registry.lands(landHash);
    expect(record.landIdField).to.equal(LAND_ID_FIELD);
    expect(record.exists).to.equal(true);
  });

  // Privacy regression guard: the registry must never publish an owner
  // identity. Ownership exists only as a commitment in the anchored tree.
  it("stores no owner identity on chain, before or after a transfer", async function () {
    const { registry, landHash, buyer } = await deployFixture();
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    const record = await registry.lands(landHash);
    // The struct exposes only deedCid, status, exists, landIdField.
    expect(Object.prototype.hasOwnProperty.call(record.toObject(), "owner")).to.equal(false);

    const receipt = await (
      await registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).wait();

    // No emitted log may contain a participant address in its topics.
    const forbidden = [buyer.address, buyerAddress].map((a) => a.toLowerCase().slice(2).padStart(64, "0"));
    for (const log of receipt!.logs) {
      for (const topic of log.topics) {
        expect(forbidden).to.not.include(topic.toLowerCase().slice(2));
      }
    }
    const after = await registry.lands(landHash);
    expect(Object.prototype.hasOwnProperty.call(after.toObject(), "owner")).to.equal(false);
  });

  it("blocks non-authority root updates", async function () {
    const { outsider, registry } = await deployFixture();

    await expect(
      registry.connect(outsider).updateMerkleRoot(transition.newRootBytes32, transitionArg(transition))
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(outsider.address);
  });

  it("rejects a root that does not match the transition proof's newRoot", async function () {
    const { registry } = await deployFixture();
    const bogusRoot = ethers.keccak256(ethers.toUtf8Bytes("bogus-root"));

    await expect(registry.updateMerkleRoot(bogusRoot, transitionArg(transition))).to.be.revertedWith(
      "NEW_ROOT_MISMATCH"
    );
  });

  it("rejects a transition that does not chain from the current root", async function () {
    const { registry } = await deployFixture();
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    // Replaying the same empty-tree insertion no longer chains: its oldRoot
    // is the empty root, but the current anchored root is newRoot.
    await expect(
      registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition))
    ).to.be.revertedWith("OLD_ROOT_NOT_CURRENT");
  });

  it("rejects a transition with a tampered proof", async function () {
    const { registry } = await deployFixture();
    const tampered = {
      a: transition.a,
      b: transition.b,
      c: transition.c,
      signals: [transition.signals[0] + 1n, transition.signals[1], transition.signals[2], transition.signals[3]] as [
        bigint,
        bigint,
        bigint,
        bigint
      ]
    };
    // Keep newRoot/oldRoot untouched so the require gates pass and the
    // Groth16 verification itself must catch the forgery.
    await expect(registry.updateMerkleRoot(transition.newRootBytes32, tampered)).to.be.revertedWith(
      "INVALID_TRANSITION_PROOF"
    );
  });

  it("allows bootstrapRoot only once", async function () {
    const { registry } = await deployFixture();
    const migratedRoot = ethers.keccak256(ethers.toUtf8Bytes("migrated-root"));

    await expect(registry.bootstrapRoot(migratedRoot)).to.emit(registry, "MerkleRootBootstrapped");
    expect(await registry.latestMerkleRoot()).to.equal(migratedRoot);
    await expect(registry.bootstrapRoot(migratedRoot)).to.be.revertedWith("ALREADY_BOOTSTRAPPED");
  });

  it("transfers land after a valid real proof for the current root", async function () {
    const { buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    await expect(
      registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    )
      .to.emit(registry, "LandTransferred")
      .withArgs(landHash, zk.publicSignals[0]);

    const record = await registry.lands(landHash);
    expect(record.status).to.equal(1n); // TRANSFERRED
    expect(await registry.usedNullifiers(zk.publicSignals[0])).to.equal(true);
  });

  it("rejects transfers whose proof root is not the current root", async function () {
    const { buyer, registry, landHash } = await deployFixture();
    const staleRoot = ethers.keccak256(ethers.toUtf8Bytes("some-other-root"));
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.bootstrapRoot(staleRoot);

    await expect(
      registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("ROOT_NOT_CURRENT");
  });

  it("rejects transfers with an invalid proof", async function () {
    const { buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    const tampered = [...zk.publicSignals];
    tampered[0] = tampered[0] + 1n; // forge the response nullifier
    await expect(
      registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, tampered)
    ).to.be.revertedWith("INVALID_PROOF");
  });

  it("rejects a proof made for a different land record", async function () {
    const { buyer, registry, landHash } = await deployFixture();
    const otherLandIdField = 424242n; // registered land uses a different field id than the proof
    await registry.registerLand(landHash, "bafy-demo", otherLandIdField);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    await expect(
      registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("LAND_ID_MISMATCH");
  });

  it("rejects redirecting a proof to a buyer it was not made for", async function () {
    const { registry, landHash, outsider } = await deployFixture();
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    await expect(
      registry.verifyAndTransfer(landHash, outsider.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("CHALLENGE_NOT_BOUND");
  });

  it("rejects replaying an already-used proof", async function () {
    const { buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));

    await registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals);

    await expect(
      registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("PROOF_ALREADY_USED");
  });

  it("blocks transfers of disputed land", async function () {
    const { buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, "bafy-demo", LAND_ID_FIELD);
    await registry.updateMerkleRoot(transition.newRootBytes32, transitionArg(transition));
    await registry.markDisputed(landHash);

    await expect(
      registry.verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("LAND_DISPUTED");
  });
});

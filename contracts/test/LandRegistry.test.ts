import { expect } from "chai";
import { network } from "hardhat";
import { generateChallengeProof, LAND_ID_FIELD, type OnChainProof } from "./zkHelpers.js";

const { ethers } = await network.create();

describe("LandRegistry", function () {
  let zk: OnChainProof;
  let buyerAddress: string;

  before(async function () {
    this.timeout(120000);
    const [, , buyer] = await ethers.getSigners();
    buyerAddress = buyer.address;
    // Real Groth16 proof whose challenge is bound to the buyer's address.
    zk = await generateChallengeProof(buyerAddress, ethers.id("landchain-test-salt"));
  });

  async function deployFixture() {
    const [authority, owner, buyer, outsider] = await ethers.getSigners();
    const verifier = await ethers.deployContract("Verifier");
    const registry = await ethers.deployContract("LandRegistry", [authority.address, await verifier.getAddress()]);
    const landHash = ethers.id("LAND-001");

    return { authority, owner, buyer, outsider, verifier, registry, landHash };
  }

  it("lets the authority register land and write the latest Merkle root", async function () {
    const { owner, registry, landHash } = await deployFixture();

    await expect(registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, LAND_ID_FIELD))
      .to.emit(registry, "LandRegistered")
      .withArgs(landHash, owner.address, "bafy-demo", zk.rootBytes32);

    expect(await registry.latestMerkleRoot()).to.equal(zk.rootBytes32);
    const record = await registry.lands(landHash);
    expect(record.owner).to.equal(owner.address);
    expect(record.landIdField).to.equal(LAND_ID_FIELD);
  });

  it("blocks non-authority root updates", async function () {
    const { outsider, registry } = await deployFixture();

    await expect(registry.connect(outsider).updateMerkleRoot(zk.rootBytes32))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(outsider.address);
  });

  it("transfers land after a valid real proof for the current root", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, LAND_ID_FIELD);

    await expect(
      registry
        .connect(owner)
        .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    )
      .to.emit(registry, "LandTransferred")
      .withArgs(landHash, owner.address, buyer.address);

    const record = await registry.lands(landHash);
    expect(record.owner).to.equal(buyer.address);
  });

  it("rejects transfers whose proof root is not the current root", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    const staleRoot = ethers.keccak256(ethers.toUtf8Bytes("some-other-root"));
    await registry.registerLand(landHash, owner.address, "bafy-demo", staleRoot, LAND_ID_FIELD);

    await expect(
      registry
        .connect(owner)
        .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("ROOT_NOT_CURRENT");
  });

  it("rejects transfers with an invalid proof", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, LAND_ID_FIELD);

    const tampered = [...zk.publicSignals];
    tampered[0] = tampered[0] + 1n; // forge the response nullifier
    await expect(
      registry
        .connect(owner)
        .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, tampered)
    ).to.be.revertedWith("INVALID_PROOF");
  });

  it("rejects a proof made for a different land record", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    const otherLandIdField = 424242n; // registered land uses a different field id than the proof
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, otherLandIdField);

    await expect(
      registry
        .connect(owner)
        .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("LAND_ID_MISMATCH");
  });

  it("rejects redirecting a proof to a buyer it was not made for", async function () {
    const { owner, registry, landHash, outsider } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, LAND_ID_FIELD);

    await expect(
      registry
        .connect(owner)
        .verifyAndTransfer(landHash, outsider.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("CHALLENGE_NOT_BOUND");
  });

  it("rejects replaying an already-used proof", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, LAND_ID_FIELD);

    await registry
      .connect(owner)
      .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals);

    // The new owner (buyer) replays the same proof.
    await expect(
      registry
        .connect(buyer)
        .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("PROOF_ALREADY_USED");
  });

  it("blocks transfers of disputed land", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32, LAND_ID_FIELD);
    await registry.markDisputed(landHash);

    await expect(
      registry
        .connect(owner)
        .verifyAndTransfer(landHash, buyer.address, zk.challengeSalt, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("LAND_DISPUTED");
  });
});

import { expect } from "chai";
import { network } from "hardhat";
import { generateChallengeProof, type OnChainProof } from "./zkHelpers.js";

const { ethers } = await network.create();

describe("LandRegistry", function () {
  let zk: OnChainProof;

  before(async function () {
    this.timeout(120000);
    zk = await generateChallengeProof();
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

    await expect(registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32))
      .to.emit(registry, "LandRegistered")
      .withArgs(landHash, owner.address, "bafy-demo", zk.rootBytes32);

    expect(await registry.latestMerkleRoot()).to.equal(zk.rootBytes32);
    const record = await registry.lands(landHash);
    expect(record.owner).to.equal(owner.address);
  });

  it("blocks non-authority root updates", async function () {
    const { outsider, registry } = await deployFixture();

    await expect(registry.connect(outsider).updateMerkleRoot(zk.rootBytes32))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(outsider.address);
  });

  it("transfers land after a valid real proof for the current root", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32);

    await expect(
      registry.connect(owner).verifyAndTransfer(landHash, buyer.address, zk.a, zk.b, zk.c, zk.publicSignals)
    )
      .to.emit(registry, "LandTransferred")
      .withArgs(landHash, owner.address, buyer.address);

    const record = await registry.lands(landHash);
    expect(record.owner).to.equal(buyer.address);
  });

  it("rejects transfers whose proof root is not the current root", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    const staleRoot = ethers.keccak256(ethers.toUtf8Bytes("some-other-root"));
    await registry.registerLand(landHash, owner.address, "bafy-demo", staleRoot);

    await expect(
      registry.connect(owner).verifyAndTransfer(landHash, buyer.address, zk.a, zk.b, zk.c, zk.publicSignals)
    ).to.be.revertedWith("ROOT_NOT_CURRENT");
  });

  it("rejects transfers with an invalid proof", async function () {
    const { owner, buyer, registry, landHash } = await deployFixture();
    await registry.registerLand(landHash, owner.address, "bafy-demo", zk.rootBytes32);

    const tampered = [...zk.publicSignals];
    tampered[0] = tampered[0] + 1n; // forge the response nullifier
    await expect(
      registry.connect(owner).verifyAndTransfer(landHash, buyer.address, zk.a, zk.b, zk.c, tampered)
    ).to.be.revertedWith("INVALID_PROOF");
  });
});

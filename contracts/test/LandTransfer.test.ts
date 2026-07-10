import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Land transfer controls", function () {
  it("rejects transfers from wallets that do not own the land", async function () {
    const [authority, owner, buyer, outsider] = await ethers.getSigners();
    const verifier = await ethers.deployContract("Verifier");
    const registry = await ethers.deployContract("LandRegistry", [authority.address, await verifier.getAddress()]);
    const landHash = ethers.id("LAND-002");
    const root = ethers.keccak256(ethers.toUtf8Bytes("root-2"));
    const salt = ethers.id("salt-2");

    await registry.registerLand(landHash, owner.address, "bafy-demo", root, 7n);

    await expect(
      registry.connect(outsider).verifyAndTransfer(
        landHash,
        buyer.address,
        salt,
        [1n, 2n],
        [[3n, 4n], [5n, 6n]],
        [7n, 8n],
        [BigInt(root)]
      )
    ).to.be.revertedWith("NOT_AUTHORIZED");
  });
});

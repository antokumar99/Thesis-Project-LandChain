import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Land transfer controls", function () {
  it("rejects transfer submissions from accounts other than the authority", async function () {
    const [authority, , buyer, outsider] = await ethers.getSigners();
    const verifier = await ethers.deployContract("Verifier");
    const rootVerifier = await ethers.deployContract("RootVerifier");
    const registry = await ethers.deployContract("LandRegistry", [
      authority.address,
      await verifier.getAddress(),
      await rootVerifier.getAddress()
    ]);
    const landHash = ethers.id("LAND-002");
    const salt = ethers.id("salt-2");

    await registry.registerLand(landHash, "bafy-demo", 7n);

    // Transfers are relayed by the authority; the seller's Groth16 proof —
    // not the caller's address — is what authorizes the ownership change.
    await expect(
      registry.connect(outsider).verifyAndTransfer(
        landHash,
        buyer.address,
        salt,
        [1n, 2n],
        [[3n, 4n], [5n, 6n]],
        [7n, 8n],
        [1n, 2n, 3n, 4n]
      )
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(outsider.address);
  });
});

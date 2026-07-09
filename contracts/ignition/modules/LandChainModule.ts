import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LandChainModule", (m) => {
  const owner = m.getAccount(0);
  const verifier = m.contract("Verifier");
  const registry = m.contract("LandRegistry", [owner, verifier]);

  return { verifier, registry };
});

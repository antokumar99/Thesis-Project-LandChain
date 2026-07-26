import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LandChainModule", (m) => {
  const owner = m.getAccount(0);
  const verifier = m.contract("Verifier");
  const rootVerifier = m.contract("RootVerifier");
  const registry = m.contract("LandRegistry", [owner, verifier, rootVerifier]);

  return { verifier, rootVerifier, registry };
});

import { BrowserProvider, Contract } from "ethers";
import { LAND_REGISTRY_ADDRESS } from "./constants";

export const landRegistryAbi = [
  "function latestMerkleRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32 root) view returns (bool)"
];

export async function getBrowserRegistry() {
  if (!window.ethereum || !LAND_REGISTRY_ADDRESS) return null;
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new Contract(LAND_REGISTRY_ADDRESS, landRegistryAbi, signer);
}

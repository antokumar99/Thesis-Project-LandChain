import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { env } from "./env";
import { LAND_REGISTRY_ABI } from "../constants/contract";

export function getRegistryContract(): Contract | null {
  if (!env.rpcUrl || !env.privateKey || !env.landRegistryAddress) return null;
  const provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
  const wallet = new Wallet(env.privateKey, provider);
  return new Contract(env.landRegistryAddress, LAND_REGISTRY_ABI, wallet);
}

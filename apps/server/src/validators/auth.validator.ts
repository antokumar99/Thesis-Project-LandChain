import { isAddress } from "ethers";

export function validateRegister(body: Record<string, unknown>): string[] {
  const missing = ["name", "email", "password", "walletAddress", "nid"].filter((key) => !body[key]);
  if (typeof body.password === "string" && body.password.length > 0 && body.password.length < 8) {
    missing.push("password must be at least 8 characters");
  }
  if (typeof body.walletAddress === "string" && body.walletAddress.length > 0 && !isAddress(body.walletAddress)) {
    missing.push("walletAddress must be a valid 0x-prefixed Ethereum address");
  }
  return missing;
}

export function validateLogin(body: Record<string, unknown>): string[] {
  return ["email", "password"].filter((key) => !body[key]);
}

import dotenv from "dotenv";
import path from "path";

// Single canonical config file: apps/server/.env.
// LANDCHAIN_SKIP_DOTENV=1 runs purely off process.env (used by integration
// tests that must not inherit developer .env settings).
if (process.env.LANDCHAIN_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });
}

// Deterministic offline mode (used by the smoke test): ignore any configured
// chain/IPFS endpoints regardless of what the .env files say.
if (process.env.LANDCHAIN_OFFLINE === "1") {
  process.env.RPC_URL = "";
  process.env.LAND_REGISTRY_ADDRESS = "";
  process.env.PRIVATE_KEY = "";
  process.env.PINATA_JWT = "";
}

// Refuse to boot in production with the well-known development JWT secret.
if ((process.env.NODE_ENV ?? "development") === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production (refusing to run with the dev-only default).");
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/landchain",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  pinataJwt: process.env.PINATA_JWT,
  ipfsGateway: process.env.IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs",
  // 32-byte hex key (64 hex chars) used to encrypt deed documents at rest and
  // before they are pinned to IPFS. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  deedEncryptionKey: process.env.DEED_ENCRYPTION_KEY,
  rpcUrl: process.env.RPC_URL,
  chainId: Number(process.env.CHAIN_ID ?? 31337),
  privateKey: process.env.PRIVATE_KEY,
  landRegistryAddress: process.env.LAND_REGISTRY_ADDRESS,
  verifierAddress: process.env.VERIFIER_ADDRESS,
  // The single fixed authority account, seeded at startup.
  authorityName: process.env.AUTHORITY_NAME ?? "Land Registry Authority",
  authorityEmail: (process.env.AUTHORITY_EMAIL ?? "authority@landchain.gov").toLowerCase(),
  authorityPassword: process.env.AUTHORITY_PASSWORD ?? "authority-dev-password",
  authorityWallet: (process.env.AUTHORITY_WALLET ?? "0x000000000000000000000000000000000000a001").toLowerCase(),
  // Root of the circuits workspace holding build/ (wasm) and keys/ (zkey, vkey).
  // `||` (not ??) so a blank CIRCUITS_DIR= line in .env still uses the default.
  circuitsDir: process.env.CIRCUITS_DIR || path.resolve(__dirname, "../../../../circuits")
};

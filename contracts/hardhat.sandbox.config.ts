// Offline config for sandboxed/CI environments that cannot download solc:
// every profile compiles with the repo-cached solc-js (WASM) compiler.
// Usage: npx hardhat test --config hardhat.sandbox.config.ts
import { fileURLToPath } from "node:url";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

// Absolute path required: hardhat's solcjs runner import()s this file directly.
const SOLJSON_PATH = fileURLToPath(
  new URL(
    ".hardhat-local-cache/hardhat-nodejs/Cache/compilers-v3/wasm/soljson-v0.8.28+commit.7893614a.cjs",
    import.meta.url,
  ),
);

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        path: SOLJSON_PATH,
      },
      production: {
        version: "0.8.28",
        path: SOLJSON_PATH,
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
  },
});

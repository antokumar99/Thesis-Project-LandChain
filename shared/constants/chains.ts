export const CHAINS = {
  hardhat: { chainId: 31337, name: "Hardhat Local", currency: "ETH" },
  sepolia: { chainId: 11155111, name: "Sepolia", currency: "ETH" },
  mainnet: { chainId: 1, name: "Ethereum", currency: "ETH" }
} as const;

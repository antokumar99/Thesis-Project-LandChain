export type ContractAddresses = {
  landRegistry?: string;
  verifier?: string;
};

export const contractAddresses: Record<number, ContractAddresses> = {
  31337: {},
  11155111: {},
  1: {}
};

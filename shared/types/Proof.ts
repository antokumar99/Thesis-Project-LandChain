export type Proof = {
  landId: string;
  ownerWallet: string;
  proof: unknown;
  publicSignals: string[];
  merkleRoot: string;
  verified: boolean;
  transactionHash?: string;
  createdAt: string;
};

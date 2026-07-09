export type TransactionType = "REGISTER" | "VERIFY" | "TRANSFER";

export type Transaction = {
  landId: string;
  fromOwner?: string;
  toOwner?: string;
  transactionType: TransactionType;
  blockchainTxHash: string;
  status: string;
  createdAt: string;
};

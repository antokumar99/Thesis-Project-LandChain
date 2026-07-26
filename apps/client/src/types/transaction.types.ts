export type TransactionRecord = {
  _id: string;
  landId?: string;
  fromOwner?: string;
  toOwner?: string;
  transactionType:
    | "LAND_REQUESTED"
    | "LAND_APPROVED"
    | "LAND_REJECTED"
    | "LIST_FOR_SALE"
    | "SALE_CANCELLED"
    | "CHALLENGE_CREATED"
    | "PROOF_GENERATED"
    | "PROOF_VERIFIED"
    | "TRANSFER"
    | "BUY";
  blockchainTxHash: string;
  status: string;
  detail?: string;
  createdAt: string;
};

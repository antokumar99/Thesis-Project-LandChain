import type { ProofRecord } from "./proof.types";

export type ChallengeStatus = "PENDING" | "PROOF_SUBMITTED" | "VERIFIED" | "FAILED" | "DECLINED";

export type ChallengeMessage = {
  sender: string;
  senderName: string;
  body: string;
  sentAt: string;
};

export type ChallengeParty = {
  _id?: string;
  name?: string;
  walletAddress?: string;
};

export type Challenge = {
  _id: string;
  landId: string;
  buyerId: string | ChallengeParty;
  sellerId: string | ChallengeParty;
  buyerWallet: string;
  sellerWallet: string;
  nonce: string;
  status: ChallengeStatus;
  messages: ChallengeMessage[];
  proofId?: string | ProofRecord;
  verifiedAt?: string;
  verificationNote?: string;
  createdAt: string;
  updatedAt: string;
};

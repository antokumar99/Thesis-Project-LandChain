export type LandStatus = "REGISTERED" | "TRANSFER_PENDING" | "TRANSFERRED" | "DISPUTED";

export type Land = {
  landId: string;
  plotNumber: string;
  location: string;
  area: string;
  ownerWallet: string;
  ownerNidHash: string;
  deedHash: string;
  ipfsCID: string;
  landCommitment: string;
  merkleRoot: string;
  merkleProof: string[];
  status: LandStatus;
  createdAt: string;
};

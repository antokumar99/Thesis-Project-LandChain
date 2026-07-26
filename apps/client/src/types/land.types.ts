export type LandStatus = "PENDING_APPROVAL" | "REGISTERED" | "REJECTED" | "LISTED_FOR_SALE";

export type LandOwnerRef = {
  _id?: string;
  name?: string;
  email?: string;
  walletAddress?: string;
  nidHash?: string;
  phone?: string;
  address?: string;
};

export type Land = {
  _id: string;
  landId: string;
  plotNumber: string;
  location: string;
  areaSqm: number;
  ownerId: string | LandOwnerRef;
  ownerWallet: string;
  deedHash: string;
  ipfsCID: string;
  landCommitment: string;
  areaCommitment: string;
  leafIndex?: number;
  merkleRoot?: string;
  pathElements?: string[];
  pathIndices?: number[];
  status: LandStatus;
  requestNote?: string;
  rejectionReason?: string;
  forSale: boolean;
  salePrice?: string;
  createdAt: string;
  updatedAt: string;
};

export type RegistryStats = {
  pending: number;
  registered: number;
  listed: number;
  users: number;
  latestRoot: string | null;
};

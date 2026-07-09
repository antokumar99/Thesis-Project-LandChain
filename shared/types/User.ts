export type UserRole = "AUTHORITY" | "OWNER" | "BUYER";

export type User = {
  name: string;
  email: string;
  passwordHash: string;
  walletAddress: string;
  role: UserRole;
  nidHash: string;
  createdAt: string;
};

export type Role = "AUTHORITY" | "USER";

export type AuthUser = {
  id: string;
  _id?: string;
  name: string;
  email: string;
  walletAddress: string;
  role: Role;
  nidHash?: string;
  phone?: string;
  address?: string;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

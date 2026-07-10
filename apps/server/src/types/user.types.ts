import type { Role } from "../constants/roles";

export type AuthUser = {
  id: string;
  role: Role;
  walletAddress: string;
  email: string;
};

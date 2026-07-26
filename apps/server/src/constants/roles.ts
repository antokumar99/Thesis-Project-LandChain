export const ROLES = {
  AUTHORITY: "AUTHORITY",
  USER: "USER"
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

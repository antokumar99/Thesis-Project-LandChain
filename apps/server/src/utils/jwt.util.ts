import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthUser } from "../types/user.types";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, env.jwtSecret) as AuthUser;
}

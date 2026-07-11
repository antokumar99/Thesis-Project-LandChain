import type { NextFunction, Request, Response } from "express";
import { messages } from "../constants/messages";
import { verifyToken } from "../utils/jwt.util";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ success: false, message: messages.unauthorized });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, message: messages.unauthorized });
  }
}

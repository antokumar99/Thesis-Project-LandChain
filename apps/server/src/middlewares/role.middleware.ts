import type { NextFunction, Request, Response } from "express";
import type { Role } from "../constants/roles";
import { messages } from "../constants/messages";

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: messages.forbidden });
      return;
    }

    next();
  };
}

import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.util";
import { AppError } from "../utils/errors.util";

export function errorMiddleware(error: Error, _req: Request, res: Response, _next: NextFunction): void {
  const mongoError = error as Error & { code?: number; keyValue?: Record<string, unknown> };
  if (mongoError.code === 11000) {
    const field = Object.keys(mongoError.keyValue ?? {})[0] ?? "record";
    res.status(409).json({ success: false, message: `${field} already exists.` });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }

  logger.error(error.message, error.stack);
  res.status(500).json({ success: false, message: error.message });
}

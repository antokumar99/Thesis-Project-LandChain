import type { NextFunction, Request, Response } from "express";
import { messages } from "../constants/messages";

export type Validator = (body: Record<string, unknown>) => string[];

export function validate(validator: Validator) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors = validator(req.body);
    if (errors.length) {
      res.status(400).json({ success: false, message: messages.validationFailed, errors });
      return;
    }

    next();
  };
}

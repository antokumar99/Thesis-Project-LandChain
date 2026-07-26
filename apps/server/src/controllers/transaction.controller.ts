import type { Request, Response } from "express";
import { TransactionModel } from "../models/Transaction.model";
import { ok } from "../utils/response.util";

export async function listTransactionsController(_req: Request, res: Response): Promise<void> {
  ok(res, await TransactionModel.find().sort({ createdAt: -1 }));
}

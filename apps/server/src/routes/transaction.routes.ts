import { Router } from "express";
import { listTransactionsController } from "../controllers/transaction.controller";
import { requireAuth } from "../middlewares/auth.middleware";

export const transactionRoutes = Router();

transactionRoutes.get("/", requireAuth, listTransactionsController);

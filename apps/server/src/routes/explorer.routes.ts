import { Router } from "express";
import { explorerBlocksController } from "../controllers/explorer.controller";
import { requireAuth } from "../middlewares/auth.middleware";

export const explorerRoutes = Router();

explorerRoutes.get("/", requireAuth, explorerBlocksController);

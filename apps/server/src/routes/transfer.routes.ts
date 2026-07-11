import { Router } from "express";
import { buyLandController } from "../controllers/transfer.controller";
import { ROLES } from "../constants/roles";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { validateBuy } from "../validators/transfer.validator";

export const transferRoutes = Router();

transferRoutes.post("/buy", requireAuth, requireRole(ROLES.USER), validate(validateBuy), buyLandController);

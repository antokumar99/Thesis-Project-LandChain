import { Router } from "express";
import { ROLES } from "../constants/roles";
import {
  approveLandController,
  cancelLandSaleController,
  getLandController,
  listLandController,
  listLandForSaleController,
  listPendingRequestsController,
  rejectLandController,
  requestLandController,
  statsController
} from "../controllers/land.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { upload } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import { validateLandRequest, validateSaleListing } from "../validators/land.validator";

export const landRoutes = Router();

landRoutes.get("/", requireAuth, listLandController);
landRoutes.get("/stats", requireAuth, statsController);
landRoutes.get("/requests", requireAuth, requireRole(ROLES.AUTHORITY), listPendingRequestsController);
landRoutes.post(
  "/request",
  requireAuth,
  requireRole(ROLES.USER),
  upload.single("deed"),
  validate(validateLandRequest),
  requestLandController
);
landRoutes.post("/:landId/approve", requireAuth, requireRole(ROLES.AUTHORITY), approveLandController);
landRoutes.post("/:landId/reject", requireAuth, requireRole(ROLES.AUTHORITY), rejectLandController);
landRoutes.get("/:landId", requireAuth, getLandController);
landRoutes.patch("/:landId/sell", requireAuth, requireRole(ROLES.USER), validate(validateSaleListing), listLandForSaleController);
landRoutes.patch("/:landId/cancel-sale", requireAuth, requireRole(ROLES.USER), cancelLandSaleController);

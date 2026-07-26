import { Router } from "express";
import { getDeedController, uploadIpfsController } from "../controllers/ipfs.controller";
import { ROLES } from "../constants/roles";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { upload } from "../middlewares/upload.middleware";

export const ipfsRoutes = Router();

ipfsRoutes.post("/deeds", requireAuth, requireRole(ROLES.AUTHORITY), upload.single("deed"), uploadIpfsController);
// Deed review: authority (any deed) or the land's current owner.
ipfsRoutes.get("/deeds/:cid", requireAuth, getDeedController);

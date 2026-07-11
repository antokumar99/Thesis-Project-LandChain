import { Router } from "express";
import {
  generateProofController,
  getProofController,
  listProofsController,
  proofStatusController,
  verifyProofController
} from "../controllers/proof.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { validateProofGeneration, validateProofVerification } from "../validators/proof.validator";

export const proofRoutes = Router();

proofRoutes.get("/", requireAuth, listProofsController);
proofRoutes.get("/status", requireAuth, proofStatusController);
proofRoutes.post("/generate", requireAuth, validate(validateProofGeneration), generateProofController);
proofRoutes.post("/verify", requireAuth, validate(validateProofVerification), verifyProofController);
proofRoutes.get("/:proofId", requireAuth, getProofController);

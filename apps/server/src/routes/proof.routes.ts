import { Router } from "express";
import {
  getProofController,
  listProofsController,
  proofStatusController,
  submitProofController,
  verifyProofController
} from "../controllers/proof.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { validateProofSubmission, validateProofVerification } from "../validators/proof.validator";

export const proofRoutes = Router();

proofRoutes.get("/", requireAuth, listProofsController);
proofRoutes.get("/status", requireAuth, proofStatusController);
// Proofs are GENERATED IN THE OWNER'S BROWSER (the secret never reaches the
// server); this endpoint verifies and records a client-generated proof.
proofRoutes.post("/submit", requireAuth, validate(validateProofSubmission), submitProofController);
proofRoutes.post("/verify", requireAuth, validate(validateProofVerification), verifyProofController);
proofRoutes.get("/:proofId", requireAuth, getProofController);

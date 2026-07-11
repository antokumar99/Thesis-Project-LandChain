import { Router } from "express";
import {
  addMessageController,
  createChallengeController,
  declineChallengeController,
  getChallengeController,
  listChallengesController,
  respondChallengeController,
  verifyChallengeController
} from "../controllers/challenge.controller";
import { ROLES } from "../constants/roles";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  validateChallengeCreation,
  validateChallengeMessage,
  validateChallengeResponse
} from "../validators/challenge.validator";

export const challengeRoutes = Router();

challengeRoutes.get("/", requireAuth, listChallengesController);
challengeRoutes.post("/", requireAuth, requireRole(ROLES.USER), validate(validateChallengeCreation), createChallengeController);
challengeRoutes.get("/:challengeId", requireAuth, getChallengeController);
challengeRoutes.post("/:challengeId/messages", requireAuth, validate(validateChallengeMessage), addMessageController);
challengeRoutes.post("/:challengeId/respond", requireAuth, validate(validateChallengeResponse), respondChallengeController);
challengeRoutes.post("/:challengeId/verify", requireAuth, verifyChallengeController);
challengeRoutes.post("/:challengeId/decline", requireAuth, declineChallengeController);

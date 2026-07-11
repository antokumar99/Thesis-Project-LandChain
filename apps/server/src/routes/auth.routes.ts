import { Router } from "express";
import { login, me, register } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { validateLogin, validateRegister } from "../validators/auth.validator";

export const authRoutes = Router();

authRoutes.post("/register", validate(validateRegister), register);
authRoutes.post("/login", validate(validateLogin), login);
authRoutes.get("/me", requireAuth, me);

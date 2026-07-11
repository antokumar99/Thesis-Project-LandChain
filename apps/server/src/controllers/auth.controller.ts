import type { Request, Response } from "express";
import { created, ok } from "../utils/response.util";
import { getMe, loginUser, registerUser } from "../services/auth.service";

export async function register(req: Request, res: Response): Promise<void> {
  const result = await registerUser(req.body);
  created(res, result, "User registered.");
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await loginUser(req.body.email, req.body.password);
  ok(res, result, "Login successful.");
}

export async function me(req: Request, res: Response): Promise<void> {
  ok(res, await getMe(req.user!.id));
}

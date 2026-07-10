import type { Response } from "express";

export function ok(res: Response, data: unknown, message = "OK"): Response {
  return res.json({ success: true, message, data });
}

export function created(res: Response, data: unknown, message = "Created"): Response {
  return res.status(201).json({ success: true, message, data });
}

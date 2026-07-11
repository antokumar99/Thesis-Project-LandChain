import type { Request, Response } from "express";
import { created } from "../utils/response.util";
import { uploadDeedToIpfs } from "../services/ipfs.service";

export async function uploadIpfsController(req: Request, res: Response): Promise<void> {
  created(res, await uploadDeedToIpfs(req.file), "Deed uploaded.");
}

import type { Request, Response } from "express";
import { ok } from "../utils/response.util";
import { buyListedLand } from "../services/transfer.service";

export async function buyLandController(req: Request, res: Response): Promise<void> {
  const result = await buyListedLand({
    landId: String(req.body.landId),
    buyerId: req.user!.id,
    buyerWallet: req.user!.walletAddress,
    newOwnerSecret: String(req.body.newOwnerSecret)
  });
  ok(res, result, "Land purchased. Ownership transferred and re-committed to your secret.");
}

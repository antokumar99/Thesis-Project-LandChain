import type { Request, Response } from "express";
import { created, ok } from "../utils/response.util";
import {
  approveLand,
  cancelLandSale,
  getLand,
  listLandForSale,
  listLands,
  listPendingRequests,
  registryStats,
  rejectLand,
  requestLandRegistration
} from "../services/land.service";

export async function requestLandController(req: Request, res: Response): Promise<void> {
  const result = await requestLandRegistration({
    landId: String(req.body.landId),
    plotNumber: String(req.body.plotNumber),
    location: String(req.body.location),
    areaSqm: Number(req.body.areaSqm),
    ownerSecret: String(req.body.ownerSecret),
    requestNote: req.body.requestNote ? String(req.body.requestNote) : undefined,
    deedFile: req.file,
    userId: req.user!.id,
    userWallet: req.user!.walletAddress
  });
  created(res, result, "Land registration request submitted. Awaiting authority approval.");
}

export async function listPendingRequestsController(_req: Request, res: Response): Promise<void> {
  ok(res, await listPendingRequests());
}

export async function approveLandController(req: Request, res: Response): Promise<void> {
  ok(res, await approveLand({ landId: String(req.params.landId), authorityId: req.user!.id }), "Land approved and registered.");
}

export async function rejectLandController(req: Request, res: Response): Promise<void> {
  ok(
    res,
    await rejectLand({
      landId: String(req.params.landId),
      authorityId: req.user!.id,
      reason: req.body.reason ? String(req.body.reason) : undefined
    }),
    "Land request rejected."
  );
}

export async function listLandController(req: Request, res: Response): Promise<void> {
  const scope = req.query.scope === "mine" || req.query.scope === "market" ? req.query.scope : "all";
  ok(res, await listLands({ scope, userId: req.user!.id, role: req.user!.role }));
}

export async function getLandController(req: Request, res: Response): Promise<void> {
  ok(res, await getLand(String(req.params.landId)));
}

export async function listLandForSaleController(req: Request, res: Response): Promise<void> {
  ok(
    res,
    await listLandForSale({
      landId: String(req.params.landId),
      salePrice: String(req.body.salePrice),
      userId: req.user!.id
    }),
    "Land listed for sale."
  );
}

export async function cancelLandSaleController(req: Request, res: Response): Promise<void> {
  ok(res, await cancelLandSale({ landId: String(req.params.landId), userId: req.user!.id }), "Land sale cancelled.");
}

export async function statsController(_req: Request, res: Response): Promise<void> {
  ok(res, await registryStats());
}

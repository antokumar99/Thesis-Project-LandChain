import type { Request, Response } from "express";
import { created } from "../utils/response.util";
import { getDeedDocument, uploadDeedToIpfs } from "../services/ipfs.service";
import { LandModel } from "../models/Land.model";
import { forbidden, notFound } from "../utils/errors.util";

export async function uploadIpfsController(req: Request, res: Response): Promise<void> {
  created(res, await uploadDeedToIpfs(req.file), "Deed uploaded.");
}

/**
 * Stream a deed document for review. Access: the authority (reviews requests)
 * or the current owner of the land the deed belongs to.
 */
export async function getDeedController(req: Request, res: Response): Promise<void> {
  const cid = String(req.params.cid);

  if (req.user!.role !== "AUTHORITY") {
    const land = await LandModel.findOne({ ipfsCID: cid }).select("ownerId");
    if (!land || String(land.ownerId) !== req.user!.id) {
      throw forbidden("You are not authorized to view this deed.");
    }
  }

  const deed = await getDeedDocument(cid);
  if (!deed) throw notFound("Deed document not found for this record.");

  res.setHeader("Content-Type", deed.mimetype);
  res.setHeader("Content-Disposition", `inline; filename="${deed.filename.replace(/[^\w.\- ]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(deed.data);
}

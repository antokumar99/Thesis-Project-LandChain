import type { Request, Response } from "express";
import { ok } from "../utils/response.util";
import { getExplorerBlocks } from "../services/explorer.service";

export async function explorerBlocksController(req: Request, res: Response): Promise<void> {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const cursor = req.query.cursor !== undefined && req.query.cursor !== "" ? Number(req.query.cursor) : null;
  ok(res, await getExplorerBlocks({ limit, cursor: Number.isFinite(cursor as number) ? cursor : null }));
}

import type { Request, Response } from "express";
import { created, ok } from "../utils/response.util";
import { getProof, listProofs, submitProof, verifyProofRecord } from "../services/proof.service";
import { artifactsStatus } from "../services/zk.service";
import { PROOF_TYPE_DESCRIPTIONS } from "../constants/proofTypes";

export async function submitProofController(req: Request, res: Response): Promise<void> {
  const result = await submitProof({
    userId: req.user!.id,
    userWallet: req.user!.walletAddress,
    landId: String(req.body.landId),
    proofType: req.body.proofType,
    proof: req.body.proof,
    publicSignals: req.body.publicSignals,
    challengeId: req.body.challengeId ? String(req.body.challengeId) : undefined
  });
  created(res, result, "Zero-knowledge proof verified and recorded.");
}

export async function verifyProofController(req: Request, res: Response): Promise<void> {
  const result = await verifyProofRecord({
    proofId: String(req.body.proofId),
    verifierId: req.user!.id,
    verifierRole: req.user!.role
  });
  ok(res, result, result.verified ? "Proof verified." : "Proof verification failed.");
}

export async function listProofsController(req: Request, res: Response): Promise<void> {
  ok(
    res,
    await listProofs({
      userId: req.user!.id,
      role: req.user!.role,
      landId: req.query.landId ? String(req.query.landId) : undefined
    })
  );
}

export async function getProofController(req: Request, res: Response): Promise<void> {
  ok(res, await getProof(String(req.params.proofId), req.user!.id, req.user!.role));
}

export async function proofStatusController(_req: Request, res: Response): Promise<void> {
  ok(res, { circuits: artifactsStatus(), proofTypes: PROOF_TYPE_DESCRIPTIONS });
}

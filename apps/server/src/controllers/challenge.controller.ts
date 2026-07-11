import type { Request, Response } from "express";
import { created, ok } from "../utils/response.util";
import {
  addChallengeMessage,
  createChallenge,
  declineChallenge,
  getChallenge,
  listChallenges,
  respondToChallenge,
  verifyChallenge
} from "../services/challenge.service";

export async function createChallengeController(req: Request, res: Response): Promise<void> {
  const result = await createChallenge({
    buyerId: req.user!.id,
    buyerWallet: req.user!.walletAddress,
    landId: String(req.body.landId),
    message: req.body.message ? String(req.body.message) : undefined
  });
  created(res, result, "Ownership challenge sent to the seller.");
}

export async function listChallengesController(req: Request, res: Response): Promise<void> {
  ok(res, await listChallenges(req.user!.id));
}

export async function getChallengeController(req: Request, res: Response): Promise<void> {
  ok(res, await getChallenge({ challengeId: String(req.params.challengeId), userId: req.user!.id, role: req.user!.role }));
}

export async function addMessageController(req: Request, res: Response): Promise<void> {
  ok(
    res,
    await addChallengeMessage({
      challengeId: String(req.params.challengeId),
      userId: req.user!.id,
      role: req.user!.role,
      body: String(req.body.body)
    }),
    "Message sent."
  );
}

export async function respondChallengeController(req: Request, res: Response): Promise<void> {
  const result = await respondToChallenge({
    challengeId: String(req.params.challengeId),
    sellerId: req.user!.id,
    sellerWallet: req.user!.walletAddress,
    ownerSecret: String(req.body.ownerSecret)
  });
  ok(res, result, "Zero-knowledge ownership proof submitted to the buyer.");
}

export async function verifyChallengeController(req: Request, res: Response): Promise<void> {
  const result = await verifyChallenge({ challengeId: String(req.params.challengeId), buyerId: req.user!.id });
  ok(res, result, result?.status === "VERIFIED" ? "Seller ownership verified." : "Proof verification failed.");
}

export async function declineChallengeController(req: Request, res: Response): Promise<void> {
  ok(res, await declineChallenge({ challengeId: String(req.params.challengeId), sellerId: req.user!.id }), "Challenge declined.");
}

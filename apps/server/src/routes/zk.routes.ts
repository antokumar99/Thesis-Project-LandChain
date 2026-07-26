import { Router, type Response } from "express";
import fs from "fs";
import path from "path";
import { env } from "../config/env";

/**
 * Serves the PUBLIC circuit parameters (wasm prover, proving key, verification
 * key) that browsers need to generate and check Groth16 proofs locally.
 * These artifacts contain no secrets — publishing them is what makes
 * client-side proving (and therefore end-to-end privacy) possible.
 */
export const zkRoutes = Router();

const CLIENT_CIRCUITS = new Set(["commitmentProof", "landOwnership", "challengeProof", "areaRange"]);

function sendArtifact(res: Response, filePath: string, contentType: string) {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: "Circuit artifact not found. Run the trusted setup." });
    return;
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  fs.createReadStream(filePath).pipe(res);
}

zkRoutes.get("/artifacts/:circuit/wasm", (req, res) => {
  const circuit = String(req.params.circuit);
  if (!CLIENT_CIRCUITS.has(circuit)) {
    res.status(404).json({ success: false, message: "Unknown circuit." });
    return;
  }
  sendArtifact(res, path.join(env.circuitsDir, "build", `${circuit}_js`, `${circuit}.wasm`), "application/wasm");
});

zkRoutes.get("/artifacts/:circuit/zkey", (req, res) => {
  const circuit = String(req.params.circuit);
  if (!CLIENT_CIRCUITS.has(circuit)) {
    res.status(404).json({ success: false, message: "Unknown circuit." });
    return;
  }
  sendArtifact(res, path.join(env.circuitsDir, "keys", `${circuit}_final.zkey`), "application/octet-stream");
});

zkRoutes.get("/artifacts/:circuit/vkey", (req, res) => {
  const circuit = String(req.params.circuit);
  if (!CLIENT_CIRCUITS.has(circuit)) {
    res.status(404).json({ success: false, message: "Unknown circuit." });
    return;
  }
  sendArtifact(res, path.join(env.circuitsDir, "keys", `${circuit}_vkey.json`), "application/json");
});

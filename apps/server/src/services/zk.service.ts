import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import * as snarkjs from "snarkjs";
import { env } from "../config/env";
import { badRequest } from "../utils/errors.util";

export type CircuitName = "commitmentProof" | "landOwnership" | "challengeProof" | "areaRange";

type CircuitConfig = {
  wasm: string;
  zkey: string;
  vkey: string;
  /** Labels for snarkjs publicSignals, in order (outputs first, then public inputs). */
  publicSignalLabels: string[];
};

function circuitConfig(name: CircuitName): CircuitConfig {
  const labels: Record<CircuitName, string[]> = {
    commitmentProof: ["landIdField", "commitment"],
    landOwnership: ["nullifier", "merkleRoot"],
    challengeProof: ["responseNullifier", "landIdField", "merkleRoot", "challenge"],
    areaRange: ["areaCommitment", "minArea"]
  };
  return {
    wasm: path.join(env.circuitsDir, "build", `${name}_js`, `${name}.wasm`),
    zkey: path.join(env.circuitsDir, "keys", `${name}_final.zkey`),
    vkey: path.join(env.circuitsDir, "keys", `${name}_vkey.json`),
    publicSignalLabels: labels[name]
  };
}

export function circuitReady(name: CircuitName): boolean {
  const config = circuitConfig(name);
  return fs.existsSync(config.wasm) && fs.existsSync(config.zkey) && fs.existsSync(config.vkey);
}

export function artifactsStatus() {
  const names: CircuitName[] = ["commitmentProof", "landOwnership", "challengeProof", "areaRange"];
  return names.map((name) => {
    const config = circuitConfig(name);
    return {
      circuit: name,
      ready: circuitReady(name),
      wasm: fs.existsSync(config.wasm),
      zkey: fs.existsSync(config.zkey),
      vkey: fs.existsSync(config.vkey),
      publicSignalLabels: config.publicSignalLabels
    };
  });
}

export async function proveWithCircuit(
  name: CircuitName,
  input: Record<string, unknown>
): Promise<{ proof: unknown; publicSignals: string[]; publicSignalLabels: string[] }> {
  const config = circuitConfig(name);
  if (!circuitReady(name)) {
    throw badRequest(
      `Circuit artifacts for "${name}" are missing. Run the trusted setup in the circuits workspace (npm run setup).`
    );
  }
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, config.wasm, config.zkey);
  return { proof, publicSignals, publicSignalLabels: config.publicSignalLabels };
}

export async function verifyWithCircuit(
  name: CircuitName,
  proof: unknown,
  publicSignals: string[]
): Promise<boolean> {
  const config = circuitConfig(name);
  if (!circuitReady(name)) {
    throw badRequest(`Circuit artifacts for "${name}" are missing. Run the trusted setup in the circuits workspace.`);
  }
  const vkey = JSON.parse(await fsp.readFile(config.vkey, "utf8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

export async function getVerificationKey(name: CircuitName): Promise<unknown> {
  const config = circuitConfig(name);
  if (!fs.existsSync(config.vkey)) throw badRequest(`Verification key for "${name}" is missing.`);
  return JSON.parse(await fsp.readFile(config.vkey, "utf8"));
}

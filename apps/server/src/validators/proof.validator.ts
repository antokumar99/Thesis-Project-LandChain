import { PROOF_TYPES } from "../constants/proofTypes";

export function validateProofSubmission(body: Record<string, unknown>): string[] {
  const errors = ["landId", "proofType", "proof", "publicSignals"].filter((key) => !body[key]);
  if (body.proofType && !Object.values(PROOF_TYPES).includes(body.proofType as never)) {
    errors.push(`proofType must be one of: ${Object.values(PROOF_TYPES).join(", ")}`);
  }
  if (body.proofType === PROOF_TYPES.CHALLENGE_RESPONSE && !body.challengeId) errors.push("challengeId");
  return errors;
}

export function validateProofVerification(body: Record<string, unknown>): string[] {
  return ["proofId"].filter((key) => !body[key]);
}

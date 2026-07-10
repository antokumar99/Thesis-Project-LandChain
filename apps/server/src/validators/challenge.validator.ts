export function validateChallengeCreation(body: Record<string, unknown>): string[] {
  return ["landId"].filter((key) => !body[key]);
}

export function validateChallengeResponse(body: Record<string, unknown>): string[] {
  return ["ownerSecret"].filter((key) => !body[key]);
}

export function validateChallengeMessage(body: Record<string, unknown>): string[] {
  return ["body"].filter((key) => !body[key]);
}

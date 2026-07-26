export function validateBuy(body: Record<string, unknown>): string[] {
  return ["landId", "newLandCommitment", "newAreaCommitment"].filter((key) => !body[key]);
}

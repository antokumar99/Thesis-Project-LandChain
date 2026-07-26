export function validateLandRequest(body: Record<string, unknown>): string[] {
  return ["landId", "plotNumber", "location", "areaSqm", "landCommitment", "areaCommitment"].filter(
    (key) => !body[key]
  );
}

export function validateSaleListing(body: Record<string, unknown>): string[] {
  return ["salePrice"].filter((key) => !body[key]);
}

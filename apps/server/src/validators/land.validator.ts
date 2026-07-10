export function validateLandRequest(body: Record<string, unknown>): string[] {
  const missing = ["landId", "plotNumber", "location", "areaSqm", "ownerSecret"].filter((key) => !body[key]);
  if (typeof body.ownerSecret === "string" && body.ownerSecret.length > 0 && body.ownerSecret.length < 8) {
    missing.push("ownerSecret must be at least 8 characters");
  }
  return missing;
}

export function validateSaleListing(body: Record<string, unknown>): string[] {
  return ["salePrice"].filter((key) => !body[key]);
}

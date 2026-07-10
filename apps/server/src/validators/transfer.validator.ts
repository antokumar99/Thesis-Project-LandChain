export function validateBuy(body: Record<string, unknown>): string[] {
  const errors = ["landId", "newOwnerSecret"].filter((key) => !body[key]);
  if (typeof body.newOwnerSecret === "string" && body.newOwnerSecret.length > 0 && body.newOwnerSecret.length < 8) {
    errors.push("newOwnerSecret must be at least 8 characters");
  }
  return errors;
}

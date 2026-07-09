import { test, expect } from "@playwright/test";

test("proof verification page renders", async ({ page }) => {
  await page.goto("/proofs/verify");
  await expect(page.getByRole("heading", { name: "Verify Proof" })).toBeVisible();
});

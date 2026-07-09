import { test, expect } from "@playwright/test";

test("transfer page renders", async ({ page }) => {
  await page.goto("/lands/transfer");
  await expect(page.getByRole("heading", { name: "Transfer Land" })).toBeVisible();
});

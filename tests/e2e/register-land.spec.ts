import { test, expect } from "@playwright/test";

test("register land page renders", async ({ page }) => {
  await page.goto("/lands/register");
  await expect(page.getByRole("heading", { name: "Register Land" })).toBeVisible();
});

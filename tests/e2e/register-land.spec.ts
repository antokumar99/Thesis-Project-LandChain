import { test, expect } from "@playwright/test";

test("request land registration page renders", async ({ page }) => {
  await page.goto("/lands/request");
  await expect(page.getByRole("heading", { name: "Request Land Registration" })).toBeVisible();
});

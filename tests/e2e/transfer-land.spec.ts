import { test, expect } from "@playwright/test";

test("land registry page renders", async ({ page }) => {
  await page.goto("/lands");
  await expect(page.getByRole("heading", { name: "Land Registry" })).toBeVisible();
});

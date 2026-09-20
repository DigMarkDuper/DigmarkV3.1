import { expect, test } from "@playwright/test";

// Trivial smoke: the home page loads and renders without a server error.
test("home page loads", async ({ page }) => {
  await page.goto("/");
  const title = await page.title();
  expect(title).toContain("Digmark");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Command Center");
});
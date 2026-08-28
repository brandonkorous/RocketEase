import { expect, test } from "@playwright/test";
import { PASSWORD, gotoReady, signupAndOnboard, uniqueEmail, waitForHydration } from "./helpers";

test.describe("auth", () => {
  test("signup → onboarding → workspace shell", async ({ page }) => {
    test.slow();
    const email = uniqueEmail("auth");
    const wsId = await signupAndOnboard(page, { name: "E2E Auth", email, password: PASSWORD, organizationName: "E2E Auth Org", workspaceName: "E2E Auth Workspace" });
    await waitForHydration(page);
    await expect(page.getByRole("link", { name: "Make It Social" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: /^calendar$/i }).first()).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toContain(`/app/${wsId}/home`);
  });

  test("unauthenticated visitors are sent to /login", async ({ page }) => {
    await gotoReady(page, "/app/nope/home");
    await page.waitForURL(/\/login/, { timeout: 60_000 });
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 60_000 });
  });
});

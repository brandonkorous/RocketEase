import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

test.describe("auth", () => {
  test("signup → onboarding → workspace shell", async ({ page }) => {
    const email = uniqueEmail("auth");
    const wsId = await signupAndOnboard(page, { name: "E2E Auth", email, password: PASSWORD, organizationName: "E2E Auth Org", workspaceName: "E2E Auth Workspace" });
    await expect(page.getByRole("link", { name: "Make It Social" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^calendar$/i }).first()).toBeVisible();
    expect(page.url()).toContain(`/app/${wsId}/home`);
  });

  test("unauthenticated visitors are sent to /login", async ({ page }) => {
    await page.goto("/app/nope/home");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
});

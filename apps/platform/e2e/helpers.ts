import { expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

export const STATE_DIR = path.join(__dirname, ".state");
export type E2EUser = { email: string; password: string; name: string; workspaceId: string; workspaceName: string; storageState: string };
export type E2EState = { runId: string; userA: E2EUser; userB: E2EUser };

export const PASSWORD = "e2e-password-1234";
export const uniqueEmail = (tag: string) => `e2e+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

export function loadState(): E2EState {
  return JSON.parse(readFileSync(path.join(STATE_DIR, "state.json"), "utf8")) as E2EState;
}

/** Dev-mode pages hydrate late and drop early clicks: retry a submit until the URL moves on. */
export async function clickUntilUrl(page: Page, button: RegExp, url: RegExp) {
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: button }).first().click();
    if (await page.waitForURL(url, { timeout: 8_000 }).then(() => true).catch(() => false)) return;
  }
  await page.waitForURL(url, { timeout: 15_000 });
}

/** Signup → onboarding (org + workspace, goals) → lands in the workspace shell. Returns the workspace id. */
export async function signupAndOnboard(page: Page, u: { name: string; email: string; password: string; organizationName: string; workspaceName: string }): Promise<string> {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await page.locator("#name").fill(u.name);
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await clickUntilUrl(page, /create account/i, /\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.locator("#organizationName").fill(u.organizationName);
  await page.locator("#workspaceName").fill(u.workspaceName);
  await clickUntilUrl(page, /create workspace/i, /\/onboarding\/goals/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("checkbox").first().check();
  await clickUntilUrl(page, /^continue$/i, /\/app\/[^/]+\/home/);
  const m = page.url().match(/\/app\/([^/]+)\/home/);
  expect(m).not.toBeNull();
  return m![1];
}

export async function pageAs(browser: Browser, u: E2EUser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: u.storageState });
  return ctx.newPage();
}

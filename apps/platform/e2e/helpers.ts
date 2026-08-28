import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

export const STATE_DIR = path.join(__dirname, ".state");
export type E2EUser = { email: string; password: string; name: string; workspaceId: string; workspaceName: string; storageState: string };
export type E2EState = { runId: string; userA: E2EUser; userB: E2EUser };

export const PASSWORD = "e2e-password-1234";
export const uniqueEmail = (tag: string) => `e2e+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** Workspace routes the specs touch; warmed once per user so no test pays the first compile. */
export const WARM_ROUTES = ["home", "accounts", "inbox", "calendar", "content", "analytics", "approvals", "settings/general", "team", "reports"];

export function loadState(): E2EState {
  return JSON.parse(readFileSync(path.join(STATE_DIR, "state.json"), "utf8")) as E2EState;
}

/**
 * Best-effort wait for React to hydrate (Next's dev server compiles client
 * chunks lazily). It never fails a test on its own — correctness comes from the
 * explicit UI waits and the click retries below.
 */
export async function waitForHydration(page: Page, timeout = 45_000) {
  await page
    .waitForFunction(() => {
      // Pages outside the app (the mock provider's consent screen) ship no React.
      if (!document.querySelector("script[src*='/_next/']")) return document.readyState !== "loading";
      const nodes: object[] = [document, document.documentElement, document.body, ...document.querySelectorAll("main, form, button, input")];
      return nodes.some((n) => Object.keys(n).some((k) => k.startsWith("__react")));
    }, undefined, { timeout })
    .catch(() => undefined);
}

/** Navigate and wait for the page to be interactive. Retries once: a dev compile can drop the first response. */
export async function gotoReady(page: Page, url: string) {
  for (let i = 0; i < 2; i++) {
    const ok = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 }).then(() => true, () => false);
    if (ok) break;
  }
  await waitForHydration(page);
}

/** Click until the URL matches: a dev-mode page can swallow a click made before its handlers attach. */
export async function clickUntilUrl(page: Page, locator: Locator, url: RegExp, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    await waitForHydration(page);
    await expect(locator).toBeEnabled({ timeout: 60_000 });
    await locator.click({ timeout: 60_000 }).catch(() => undefined);
    if (await page.waitForURL(url, { timeout: 30_000 }).then(() => true).catch(() => false)) return;
    // A submit stuck in its pending state means the dev server dropped the action; reload and try again.
    if (await locator.getAttribute("aria-busy").then((v) => v === "true").catch(() => false)) await page.reload({ waitUntil: "networkidle" }).catch(() => undefined);
  }
  await page.waitForURL(url, { timeout: 60_000 });
}

/** Compile every route this user's tests will open, so test timings measure the app and not webpack. */
export async function warmWorkspaceRoutes(page: Page, workspaceId: string) {
  for (const route of WARM_ROUTES) await gotoReady(page, `/app/${workspaceId}/${route}`).catch(() => undefined);
}

/** Hit an unauthenticated route until the dev server answers it (first hit compiles it). */
export async function warmPublicRoutes(baseURL: string, paths: string[]) {
  for (const p of paths) {
    for (let i = 0; i < 3; i++) {
      const ok = await fetch(baseURL + p).then((r) => r.status < 500, () => false);
      if (ok) break;
    }
  }
}

/**
 * Dev-mode pages can be reloaded under us (Fast Refresh after a file save) which
 * wipes form state; re-run `prepare` (fills) before each submit attempt.
 */
export async function submitUntilUrl(page: Page, prepare: () => Promise<void>, button: RegExp, url: RegExp) {
  for (let i = 0; i < 4; i++) {
    await waitForHydration(page);
    // Fill first: the inputs are the real readiness signal, and some steps only
    // enable their submit once the form is valid.
    await prepare();
    const submit = page.getByRole("button", { name: button }).first();
    await expect(submit).toBeEnabled({ timeout: 90_000 });
    await submit.click({ timeout: 90_000 }).catch(() => undefined);
    if (await page.waitForURL(url, { timeout: 30_000 }).then(() => true).catch(() => false)) return;
  }
  await page.waitForURL(url, { timeout: 60_000 });
}

/** A click before hydration toggles the DOM box without updating form state; re-toggle until Continue reacts. */
async function pickGoalUntilEnabled(page: Page) {
  const cb = page.getByRole("checkbox").first();
  const btn = page.getByRole("button", { name: /^continue$/i }).first();
  for (let i = 0; i < 12; i++) {
    if (await btn.isEnabled().catch(() => false)) return;
    await cb.click().catch(() => undefined);
    await page.waitForTimeout(500);
    if (await btn.isEnabled().catch(() => false)) return;
    await page.waitForTimeout(1_000);
  }
}

/** Signup → onboarding (org + workspace, goals) → lands in the workspace shell. Returns the workspace id. */
export async function signupAndOnboard(page: Page, u: { name: string; email: string; password: string; organizationName: string; workspaceName: string }): Promise<string> {
  await page.goto("/signup");
  await submitUntilUrl(page, async () => {
    await page.locator("#name").fill(u.name);
    await page.locator("#email").fill(u.email);
    await page.locator("#password").fill(u.password);
  }, /create account/i, /\/onboarding/);
  await submitUntilUrl(page, async () => {
    await page.locator("#organizationName").fill(u.organizationName);
    await page.locator("#workspaceName").fill(u.workspaceName);
  }, /create workspace/i, /\/onboarding\/goals/);
  await submitUntilUrl(page, () => pickGoalUntilEnabled(page), /^continue$/i, /\/app\/[^/]+\/home/);
  const m = page.url().match(/\/app\/([^/]+)\/home/);
  expect(m).not.toBeNull();
  return m![1];
}

export async function pageAs(browser: Browser, u: E2EUser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: u.storageState });
  return ctx.newPage();
}

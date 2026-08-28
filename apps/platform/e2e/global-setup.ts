import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PASSWORD, STATE_DIR, signupAndOnboard, uniqueEmail, type E2EState, type E2EUser } from "./helpers";

/** Creates two independent tenants (user A / user B) through the real UI and stores their sessions. */
async function createUser(baseURL: string, tag: string, runId: string): Promise<E2EUser> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  const email = uniqueEmail(tag);
  const workspaceName = `E2E ${tag.toUpperCase()} ${runId}`;
  const workspaceId = await signupAndOnboard(page, { name: `E2E ${tag}`, email, password: PASSWORD, organizationName: `E2E Org ${tag} ${runId}`, workspaceName });
  const storageState = path.join(STATE_DIR, `${tag}.json`);
  await page.context().storageState({ path: storageState });
  await browser.close();
  return { email, password: PASSWORD, name: `E2E ${tag}`, workspaceId, workspaceName, storageState };
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5001";
  mkdirSync(STATE_DIR, { recursive: true });
  const runId = Date.now().toString(36);
  const userA = await createUser(baseURL, "a", runId);
  const userB = await createUser(baseURL, "b", runId);
  const state: E2EState = { runId, userA, userB };
  writeFileSync(path.join(STATE_DIR, "state.json"), JSON.stringify(state, null, 2));
}

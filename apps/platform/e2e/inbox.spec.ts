import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickUntilUrl, gotoReady, loadState, pageAs, waitForHydration } from "./helpers";

/** Connect the demo network to the workspace through the real consent + selection flow. */
async function connectDemoNetwork(page: Page, workspaceId: string) {
  await gotoReady(page, `/app/${workspaceId}/accounts`);
  const connected = page.getByText("Demo Brand", { exact: false }).first();
  // The entry point is a MENU, not a link: components/accounts/connect-menu.tsx renders a
  // "Connect account" trigger whose items navigate on click.
  const trigger = page.getByRole("button", { name: /connect account/i });
  // The page streams; wait until it shows either an existing connection or the connect entry point.
  await expect(connected.or(trigger).first()).toBeVisible({ timeout: 60_000 });
  if (await connected.isVisible().catch(() => false)) return;
  await pickDemoNetwork(page, trigger);
  await clickUntilUrl(page, page.getByRole("button", { name: "Allow" }), /\/accounts\/select\//);
  await clickUntilUrl(page, page.getByRole("button", { name: /add selected accounts/i }), /\/accounts\?connected=1/);
}

/**
 * Opening the menu and choosing the network are retried AS A PAIR. A trigger click that
 * lands before hydration opens nothing, and a menu that did open can be closed again by a
 * re-render — either way the item is unmounted, so retrying the item click on its own would
 * just wait out its timeout against an element that no longer exists.
 */
async function pickDemoNetwork(page: Page, trigger: Locator) {
  const authorize = /\/connect\/mock\/authorize/;
  for (let i = 0; i < 4; i++) {
    await waitForHydration(page);
    await trigger.click({ timeout: 60_000 }).catch(() => undefined);
    const item = page.getByRole("menuitem", { name: /demo network/i });
    if (!(await item.isVisible({ timeout: 10_000 }).catch(() => false))) continue;
    await item.click({ timeout: 30_000 }).catch(() => undefined);
    if (await page.waitForURL(authorize, { timeout: 30_000 }).then(() => true).catch(() => false)) return;
  }
  await page.waitForURL(authorize, { timeout: 60_000 });
}

/** Dev-mode reloads (Fast Refresh) can wipe the form; re-open the tools and re-fill before each attempt. */
async function simulateUntilToast(page: Page, marker: string) {
  const tools = page.locator("details", { hasText: "Demo network tools" });
  await expect(tools).toBeVisible({ timeout: 60_000 });
  for (let i = 0; i < 4; i++) {
    await waitForHydration(page);
    if (!(await tools.getAttribute("open").then((v) => v !== null))) await tools.locator("summary").click();
    const field = page.getByLabel("Simulated message");
    await expect(field).toBeVisible({ timeout: 30_000 });
    await field.fill(marker);
    await page.getByRole("button", { name: /simulate new dm/i }).click();
    if (await page.getByText(/incoming message simulated/i).first().isVisible({ timeout: 10_000 }).catch(() => false)) return;
  }
  await expect(page.getByText(/incoming message simulated/i).first()).toBeVisible();
}

test.describe("inbox", () => {
  test("simulated inbound DM appears in the queue", async ({ browser }) => {
    test.slow();
    const { userA } = loadState();
    const page = await pageAs(browser, userA);
    await connectDemoNetwork(page, userA.workspaceId);
    await gotoReady(page, `/app/${userA.workspaceId}/inbox`);
    const marker = `E2E hello ${Date.now()}`;
    await simulateUntilToast(page, marker);
    // Ingestion goes webhook receipt → worker → conversation; poll the page until it lands.
    await expect
      .poll(async () => {
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
        return page.getByText(marker, { exact: false }).first().isVisible({ timeout: 5_000 }).catch(() => false);
      }, { timeout: 60_000, intervals: [2_000] })
      .toBe(true);
    await page.getByText(marker, { exact: false }).first().click();
    await page.waitForURL(/\/inbox\/[^/]+/, { timeout: 60_000 });
    await waitForHydration(page);
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    await page.context().close();
  });
});

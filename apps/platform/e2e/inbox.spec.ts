import { expect, test, type Page } from "@playwright/test";
import { clickUntilUrl, gotoReady, loadState, pageAs, waitForHydration } from "./helpers";

/** Connect the demo network to the workspace through the real consent + selection flow. */
async function connectDemoNetwork(page: Page, workspaceId: string) {
  await gotoReady(page, `/app/${workspaceId}/accounts`);
  const connect = page.getByRole("link", { name: /connect demo/i });
  const connected = page.getByText("Demo Brand", { exact: false }).first();
  // The page streams; wait until it shows either an existing connection or the connect entry point.
  await expect(connected.or(connect).first()).toBeVisible({ timeout: 60_000 });
  if (await connected.isVisible().catch(() => false)) return;
  await clickUntilUrl(page, connect, /\/connect\/mock\/authorize/);
  await clickUntilUrl(page, page.getByRole("button", { name: "Allow" }), /\/accounts\/select\//);
  await clickUntilUrl(page, page.getByRole("button", { name: /add selected accounts/i }), /\/accounts\?connected=1/);
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

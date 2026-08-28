import { expect, test, type Page } from "@playwright/test";
import { loadState, pageAs, waitForHydration } from "./helpers";

/** Connect the demo network to the workspace through the real consent + selection flow. */
async function connectDemoNetwork(page: Page, workspaceId: string) {
  await page.goto(`/app/${workspaceId}/accounts`);
  await waitForHydration(page);
  if (await page.getByText("Demo Brand", { exact: false }).first().isVisible().catch(() => false)) return;
  await page.getByRole("link", { name: /connect demo/i }).click();
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(/\/accounts\/select\//);
  await page.getByRole("button", { name: /add selected accounts/i }).click();
  await page.waitForURL(/\/accounts\?connected=1/);
}

/** Dev-mode reloads (Fast Refresh) can wipe the form; re-open the tools and re-fill before each attempt. */
async function simulateUntilToast(page: Page, marker: string) {
  for (let i = 0; i < 4; i++) {
    await waitForHydration(page);
    const tools = page.locator("details", { hasText: "Demo network tools" });
    if (!(await tools.getAttribute("open").then((v) => v !== null))) await tools.locator("summary").click();
    await page.getByLabel("Simulated message").fill(marker);
    await page.getByRole("button", { name: /simulate new dm/i }).click();
    if (await page.getByText(/incoming message simulated/i).first().isVisible({ timeout: 6_000 }).catch(() => false)) return;
  }
  await expect(page.getByText(/incoming message simulated/i).first()).toBeVisible();
}

test.describe("inbox", () => {
  test("simulated inbound DM appears in the queue", async ({ browser }) => {
    test.slow();
    const { userA } = loadState();
    const page = await pageAs(browser, userA);
    await connectDemoNetwork(page, userA.workspaceId);
    await page.goto(`/app/${userA.workspaceId}/inbox`);
    await waitForHydration(page);
    const marker = `E2E hello ${Date.now()}`;
    await simulateUntilToast(page, marker);
    // Ingestion goes webhook receipt → worker → conversation; poll the page until it lands.
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByText(marker, { exact: false }).first().isVisible().catch(() => false);
      }, { timeout: 45_000, intervals: [2_000] })
      .toBe(true);
    await page.getByText(marker, { exact: false }).first().click();
    await page.waitForURL(/\/inbox\/[^/]+/);
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
    await page.context().close();
  });
});

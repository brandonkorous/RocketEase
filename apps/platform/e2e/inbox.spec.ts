import { expect, test, type Page } from "@playwright/test";
import { loadState, pageAs } from "./helpers";

/** Connect the demo network to the workspace through the real consent + selection flow. */
async function connectDemoNetwork(page: Page, workspaceId: string) {
  await page.goto(`/app/${workspaceId}/accounts`);
  if (await page.getByText("Demo Brand", { exact: false }).first().isVisible().catch(() => false)) return;
  await page.getByRole("link", { name: /connect demo/i }).click();
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(/\/accounts\/select\//);
  await page.getByRole("button", { name: /add selected accounts/i }).click();
  await page.waitForURL(/\/accounts\?connected=1/);
}

/** Dev-mode pages hydrate late; a click before hydration is dropped. Retry until the action's toast shows. */
async function clickUntilToast(page: Page, button: RegExp, toast: RegExp) {
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: button }).click();
    if (await page.getByText(toast).first().isVisible({ timeout: 5_000 }).catch(() => false)) return;
    await page.waitForTimeout(1_500);
  }
  await expect(page.getByText(toast).first()).toBeVisible();
}

test.describe("inbox", () => {
  test("simulated inbound DM appears in the queue", async ({ browser }) => {
    test.slow();
    const { userA } = loadState();
    const page = await pageAs(browser, userA);
    await connectDemoNetwork(page, userA.workspaceId);
    await page.goto(`/app/${userA.workspaceId}/inbox`);
    await page.waitForLoadState("networkidle");
    const marker = `E2E hello ${Date.now()}`;
    await page.getByText("Demo network tools (local only)").click();
    await page.getByLabel("Simulated message").fill(marker);
    await clickUntilToast(page, /simulate new dm/i, /incoming message simulated/i);
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

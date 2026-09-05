import { expect, test } from "@playwright/test";
import { loadState, pageAs } from "./helpers";

/*
 * permissions.md: a non-member must never learn that another workspace exists.
 * User B probes user A's workspace routes and must be redirected to their own
 * workspace with none of A's data in the response.
 */
const ROUTES = ["home", "inbox", "analytics", "settings/general", "calendar", "grid", "content", "team", "reports"];

test.describe("tenant isolation", () => {
  for (const route of ROUTES) {
    test(`user B cannot open user A's /${route}`, async ({ browser }) => {
      const { userA, userB } = loadState();
      const page = await pageAs(browser, userB);
      await page.goto(`/app/${userA.workspaceId}/${route}`);
      await page.waitForURL((u) => !u.pathname.includes(userA.workspaceId));
      expect(page.url()).not.toContain(userA.workspaceId);
      expect(page.url()).toContain(`/app/${userB.workspaceId}/`);
      // The probed id is the requester's own input (echoed in Next's route params); A's data must not be.
      const body = await page.content();
      expect(body).not.toContain(userA.workspaceName);
      expect(body).toContain(userB.workspaceName);
      await page.context().close();
    });
  }

  test("analytics export for a foreign workspace is refused", async ({ browser }) => {
    const { userA, userB } = loadState();
    const page = await pageAs(browser, userB);
    const res = await page.request.get(`/app/${userA.workspaceId}/analytics/export`, { maxRedirects: 0 });
    expect([302, 303, 307, 308, 403, 404]).toContain(res.status());
    expect(res.headers()["content-type"] ?? "").not.toContain("text/csv");
    await page.context().close();
  });
});

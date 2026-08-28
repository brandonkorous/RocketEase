import { expect, test } from "@playwright/test";
import { loadState, pageAs } from "./helpers";

test.describe("analytics export", () => {
  test("CSV is self-describing (ANA-003 header block)", async ({ browser }) => {
    const { userA } = loadState();
    const page = await pageAs(browser, userA);
    const res = await page.request.get(`/app/${userA.workspaceId}/analytics/export?preset=7d`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="analytics_.*\.csv"/);
    const csv = await res.text();
    const lines = csv.split("\n");
    expect(lines[0]).toBe("# Make It Social analytics export");
    expect(lines.find((l) => l.startsWith("# workspace,"))).toContain(userA.workspaceId);
    expect(lines.some((l) => l.startsWith("# generated_at,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("# period,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("# definitions_version,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("# source_freshness,"))).toBe(true);
    expect(lines).toContain("section,metric,definition,formula,unit,current,previous,change_abs");
    expect(lines).toContain("section,day,network,engagement");
    expect(lines).toContain("section,post,network,channel,published_at,url,reach,engagement,link_clicks");
    await page.context().close();
  });
});

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { shiftDay } from "@/lib/analytics/periods";
import { buildReportDocument } from "@/lib/reports/build";
import { buildRollupDocument } from "@/lib/reports/rollup";
import { renderReportHtml, renderRollupHtml } from "@/lib/reports/render";
import { dayKey } from "@/lib/time";

const WS = process.argv[2] ?? "96a277ad-7987-4389-ae66-ea024636ebb1";
const OUT = process.argv[3] ?? ".";

async function main() {
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, WS) });
  if (!ws) throw new Error(`workspace ${WS} not found`);
  const to = shiftDay(dayKey(new Date(), ws.timezone), -1);
  const filters = { from: shiftDay(to, -27), to, compare: "previous" as const, scope: "all" as const };
  const doc = await buildReportDocument({ workspace: ws, filters, title: "Monthly performance" });
  const html = renderReportHtml(doc);
  writeFileSync(`${OUT}/report.html`, html);
  console.log("report.html bytes:", Buffer.byteLength(html));
  console.log("period:", doc.meta.periodLabel, "| compare:", doc.meta.comparisonLabel, "| tz:", doc.meta.timezone);
  console.log("scorecard:", doc.scorecard.map((s) => `${s.name}=${s.value}${s.unavailable ? " (unavailable)" : ""}`).join(", "));
  console.log("trend points:", doc.trend.length, "| mix:", doc.mix.length, "| top posts:", doc.topPosts.length);
  console.log("inbox rows:", doc.inbox?.length ?? 0, "| paid:", Boolean(doc.paid), "| insights:", doc.insights.length);
  console.log("appendix metrics:", doc.appendix.metrics.length, "| freshness:", doc.appendix.freshnessLabel, "| stale:", doc.appendix.staleSources.length);
  console.log("external refs:", (html.match(/(?:src|href)="https?:\/\/[^"]*"/g) ?? []).length, "| has <script>:", html.includes("<script"));

  const rollup = await buildRollupDocument({ organizationId: ws.organizationId, organizationName: "Agency", workspaces: [ws], filters, title: "Agency overview", timezone: ws.timezone });
  const rhtml = renderRollupHtml(rollup);
  writeFileSync(`${OUT}/rollup.html`, rhtml);
  console.log("rollup.html bytes:", Buffer.byteLength(rhtml), "| clients:", rollup.clients.length);
  console.log("client rows:", rollup.clients[0]?.rows.map((r) => `${r.label}=${r.value}`).join(", "), "| spend:", rollup.clients[0]?.spend);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

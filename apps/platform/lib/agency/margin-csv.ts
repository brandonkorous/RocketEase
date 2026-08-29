/*
 * Economics export. Self-describing like the analytics CSV: the header block
 * records the period, the currency, and how every column is defined, so the
 * file can be handed to a bookkeeper without a covering note.
 *
 * An unknown value is written as the word "unavailable" plus its reason in the
 * adjacent column — never as 0.
 */
import { csvNote, csvRow } from "@/lib/csv";
import type { MarginReport } from "./margin-queries";
import type { Money, MarginRow } from "./margin";

export const DEFINITIONS: [string, string][] = [
  ["Platform share", "The organization's Stripe subscription cost divided by its billed workspaces, normalised to one month."],
  ["AI", "Credits used above the workspace's included allowance, priced at the Stripe AI overage price."],
  ["Ad spend", "Imported paid `spend` insights for the period, in the ad account's currency. Never typed in."],
  ["Revenue", "The rate you set for this client: retainer, or per-post rate x posts published, plus any rebilled ad spend and AI at their markup."],
  ["Cost", "Platform share + AI + ad spend when you buy the media (an ad-spend markup is configured)."],
  ["Margin", "Revenue - cost. Blank whenever any input is unavailable."],
  ["Posts published", "Post variants whose publish succeeded inside the period."],
  ["Conversations handled", "Conversations first replied to, or resolved, inside the period."],
];

const amount = (m: Money) => (m.cents === null ? "unavailable" : (m.cents / 100).toFixed(2));
const why = (m: Money) => (m.cents === null ? (m.reason ?? "") : "");

const HEAD = [
  "workspace_id", "client", "currency", "billing_model", "posts_published", "conversations_handled", "ai_credits",
  "revenue", "revenue_note", "platform_share", "platform_share_note", "ai_cost", "ai_cost_note",
  "ad_spend", "ad_spend_note", "agency_pays_media", "cost", "cost_note", "margin", "margin_note", "margin_pct", "rate_note",
];

const line = (r: MarginRow) =>
  csvRow([
    r.workspaceId, r.workspaceName, r.currency, r.billingModel, r.postsPublished, r.conversationsHandled,
    r.aiCreditsUsed ?? "unavailable",
    amount(r.revenue), why(r.revenue), amount(r.platformShare), why(r.platformShare), amount(r.aiCost), why(r.aiCost),
    amount(r.adSpend), why(r.adSpend), r.agencyPaysMedia ? "yes" : "no",
    amount(r.cost), why(r.cost), amount(r.margin), why(r.margin),
    r.marginPct === null ? "unavailable" : (r.marginPct * 100).toFixed(1),
    r.note,
  ]);

export function buildMarginCsv(report: MarginReport, meta: { organizationName: string; generatedBy: string; timezone: string }): string {
  const t = report.totals;
  const lines = [
    csvNote("RocketEase client economics"),
    csvNote("organization", meta.organizationName),
    csvNote("period", report.period.label, report.period.from.toISOString(), report.period.to.toISOString()),
    csvNote("timezone", meta.timezone),
    csvNote("generated_at", new Date().toISOString(), "by", meta.generatedBy),
    csvNote("billed_workspaces", report.platform.workspaceQuantity || "unknown"),
    csvNote("included_ai_credits_per_workspace", report.platform.includedCredits),
    csvNote("amounts", "minor units shown as decimal; unavailable means the input is unknown, never zero"),
    ...DEFINITIONS.map(([k, v]) => csvNote("definition", k, v)),
    "",
    csvRow(HEAD),
    ...report.rows.map(line),
    "",
    csvRow(["totals", t.currency ?? "mixed", t.clients, t.postsPublished, t.conversationsHandled,
      amount(t.revenue), why(t.revenue), amount(t.cost), why(t.cost), amount(t.margin), why(t.margin),
      t.marginPct === null ? "unavailable" : (t.marginPct * 100).toFixed(1)]),
  ];
  return `${lines.join("\n")}\n`;
}

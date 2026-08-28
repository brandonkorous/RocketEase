/*
 * Unanswered inbox load against the workspace response target. One workspace-level
 * recommendation; the numbers come from conversation rows, never from a guess at
 * "industry standard" response times.
 */
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { MIN, round, type RecommendationDraft, type Rule, type WorkspaceFacts } from "../types";

const hours = (m: number) => `${(m / 60).toFixed(1)}h`;

/** Reasons this workspace is behind, most severe first. */
function reasons(f: WorkspaceFacts): { text: string; severe: boolean }[] {
  const i = f.inbox;
  const out: { text: string; severe: boolean }[] = [];
  if (i.overdue > 0) out.push({ text: `${i.overdue} conversation${i.overdue === 1 ? " is" : "s are"} past the response target`, severe: true });
  if (i.targetMinutes && i.medianFirstResponseMinutes !== null && i.answeredSample >= MIN.answeredConversations && i.medianFirstResponseMinutes > i.targetMinutes)
    out.push({ text: `your median first reply is ${hours(i.medianFirstResponseMinutes)} against a ${hours(i.targetMinutes)} target`, severe: true });
  if (i.unanswered >= 5) out.push({ text: `${i.unanswered} open conversations have had no reply yet`, severe: false });
  return out;
}

export const inboxResponseLoadRule: Rule = (f) => {
  const found = reasons(f);
  if (!found.length) return [];
  const i = f.inbox;
  const draft: RecommendationDraft = {
    kind: "inbox_response_load",
    target: "workspace",
    title: "The inbox is behind its response target",
    body: `Right now ${found.map((r) => r.text).join(", and ")}. Assign the backlog or adjust the target in Settings → Inbox so the number means something.`,
    confidence: found.some((r) => r.severe) ? (i.answeredSample >= 20 ? "high" : "medium") : "low",
    evidence: {
      metrics: [
        { label: "Open conversations", value: i.open, unit: "count" },
        { label: "Open with no reply", value: i.unanswered, unit: "count" },
        { label: "Past the response target", value: i.overdue, unit: "count" },
        ...(i.medianFirstResponseMinutes === null ? [] : [{ label: "Median first reply (minutes)", value: round(i.medianFirstResponseMinutes, 0), unit: "count" as const }]),
        ...(i.targetMinutes === null ? [] : [{ label: "Response target (minutes)", value: i.targetMinutes, unit: "count" as const }]),
      ],
      period: f.period,
      samples: [{ label: "Answered conversations measured", n: i.answeredSample }, { label: "Open conversations", n: i.open }],
      definitionsVersion: DEFINITIONS_VERSION,
      note: i.targetMinutes === null ? "No response target is set for this workspace; only the unanswered count is used." : "First reply time is measured from when the conversation opened to its first outbound reply.",
    },
    action: { label: "Open the inbox", segment: "inbox" },
  };
  return [draft];
};

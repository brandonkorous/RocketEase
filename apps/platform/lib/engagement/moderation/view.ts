/*
 * How a moderation state reads in the thread: a glyph and a label (status is
 * icon + label, never colour alone), then the reason, who did it and when.
 * Pure, so the inbox and any future digest say the same thing.
 */
import type { MessageModeration, ModerationAction, ModerationRemote } from "@/db/schema/engagement";

export type ModerationView = { action: ModerationAction; remote: ModerationRemote; glyph: string; label: string; detail: string; reason: string };

export function moderationView(m: MessageModeration, network: string, by: string, at: string): ModerationView {
  const byAt = `${by} · ${at}`;
  const base = { action: m.action, remote: m.remote, reason: m.reason };
  switch (m.remote) {
    case "hidden":
      return { ...base, glyph: "⊘", label: `Hidden on ${network}`, detail: `${m.reason} — ${byAt}` };
    case "pending":
      return m.action === "unhide" ? { ...base, glyph: "⊘", label: "Showing it again…", detail: byAt } : { ...base, glyph: "⊘", label: `Hiding on ${network}…`, detail: `${m.reason} — ${byAt}` };
    case "failed":
      return { ...base, glyph: "⚠", label: m.action === "unhide" ? "Could not show it again" : `Not hidden on ${network}`, detail: `${m.note ?? "The network returned an error."} — ${byAt}` };
    case "unsupported":
      return { ...base, glyph: "⚑", label: "Flagged — could not hide", detail: `${m.note ?? ""} ${m.reason} — ${byAt}`.trim() };
    default:
      return { ...base, glyph: "⚑", label: "Flagged", detail: `${m.reason} — ${byAt}` };
  }
}

/** Who moderated, in words: the rule by name, else the person, else "a rule". */
export function moderatedBy(m: MessageModeration, names: Map<string, string>): string {
  if (m.ruleName) return `rule “${m.ruleName}”`;
  if (m.actorUserId) return names.get(m.actorUserId) ?? "a teammate";
  return "a rule";
}

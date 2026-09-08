/*
 * Mock inbox: deterministic seed conversations per channel plus an inject
 * hook so the UI/worker loop (poll → ingest → reply → reconcile) can be
 * exercised locally.
 */
import type { InboxItem, InboxItemKind, InboxPage, ModerationRequest, ModerationResult, ReplyLookup, ReplyRequest, ReplyResult } from "../inbox-types";
import { ProviderError } from "../types";

type Store = { items: Map<string, InboxItem[]>; replies: Map<string, ReplyResult>; seeded: Set<string>; hidden: Set<string>; ambiguousReply?: boolean; seq: number };
const g = globalThis as unknown as { __misMockInbox?: Store };
const store = (): Store => (g.__misMockInbox ??= { items: new Map(), replies: new Map(), seeded: new Set(), hidden: new Set(), seq: 0 });
const now = () => new Date().toISOString();
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const PEOPLE = [
  { remoteId: "u-sarah", name: "Sarah Patterson", handle: "@sarah.fitjourney" },
  { remoteId: "u-mike", name: "Mike Chen", handle: "@mike.chen" },
  { remoteId: "u-amanda", name: "Amanda Hopkins", handle: "@amandah" },
  { remoteId: "u-james", name: "James Lee", handle: "@jameslee" },
  { remoteId: "u-olivia", name: "Olivia Martinez", handle: "@olivia.m" },
];

const SEED: { who: number; kind: InboxItemKind; text: string; minutesAgo: number; rating?: number }[] = [
  { who: 0, kind: "message", text: "Hi! I saw your post about the 4-week strength program. Do you offer any nutrition guidance with it?", minutesAgo: 95 },
  { who: 1, kind: "message", text: "Do you offer personal training sessions online?", minutesAgo: 240 },
  { who: 2, kind: "comment", text: "Love your content! 🔥", minutesAgo: 300 },
  { who: 3, kind: "mention", text: "@demobrand when is the next live workout?", minutesAgo: 420 },
  { who: 4, kind: "comment", text: "Can I get a refund for my last order?", minutesAgo: 1500 },
];

function seed(channelRemoteId: string) {
  const s = store();
  if (s.seeded.has(channelRemoteId)) return;
  s.seeded.add(channelRemoteId);
  const list: InboxItem[] = SEED.map((x, i) => {
    const thread = `${channelRemoteId}-t${i + 1}`;
    const post = x.kind === "message" ? undefined : `mockpost_seed${i}`;
    return {
      remoteId: `${thread}-m1`, threadRemoteId: thread, kind: x.kind, direction: "inbound", author: PEOPLE[x.who], text: x.text, occurredAt: ago(x.minutesAgo),
      postRemoteId: post, postUrl: post ? `https://demo.invalid/${channelRemoteId}/${post}` : undefined,
    };
  });
  s.items.set(channelRemoteId, list);
}

export const mockInbox = {
  reset() { g.__misMockInbox = undefined; },
  setAmbiguousReply(v: boolean) { store().ambiguousReply = v; },
  /** Test hook: drop the client-reference index so reconciliation must match structurally. */
  forgetReplyKeys() { store().replies.clear(); },
  /** Simulate a customer writing in (new thread when threadRemoteId is omitted); `occurredAt` backdates it. */
  inject(channelRemoteId: string, input: { text: string; kind?: InboxItemKind; threadRemoteId?: string; who?: number; occurredAt?: string }): InboxItem {
    seed(channelRemoteId);
    const s = store();
    const who = PEOPLE[(input.who ?? s.seq) % PEOPLE.length];
    const thread = input.threadRemoteId ?? `${channelRemoteId}-t${Date.now().toString(36)}`;
    const item: InboxItem = { remoteId: `${thread}-m${++s.seq}-${Date.now().toString(36)}`, threadRemoteId: thread, kind: input.kind ?? "message", direction: "inbound", author: who, text: input.text, occurredAt: input.occurredAt ?? now() };
    s.items.get(channelRemoteId)!.push(item);
    return item;
  },
  threads(channelRemoteId: string) { seed(channelRemoteId); return [...new Set((store().items.get(channelRemoteId) ?? []).map((i) => i.threadRemoteId))]; },
  /** An item the network delivered by webhook exists on the network too, so it can be hidden later. */
  remember(channelRemoteId: string, item: InboxItem) {
    seed(channelRemoteId);
    const list = store().items.get(channelRemoteId)!;
    if (!list.some((i) => i.remoteId === item.remoteId)) list.push(item);
  },
  /** Whether the demo network currently hides this comment. */
  isHidden(remoteId: string) { return store().hidden.has(remoteId); },
};

export async function fetchInbox(channelRemoteId: string, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  seed(channelRemoteId);
  const all = store().items.get(channelRemoteId) ?? [];
  const since = opts.since ? Date.parse(opts.since) : 0;
  return { items: all.filter((i) => Date.parse(i.occurredAt) > since).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

const WINDOW_MS = 24 * 3_600_000;

/** Meta's standard messaging window, mirrored: a DM reply is accepted only within 24 h of the customer's last message on the thread. */
function assertWindowOpen(channelRemoteId: string, threadRemoteId: string) {
  const last = (store().items.get(channelRemoteId) ?? []).filter((i) => i.threadRemoteId === threadRemoteId && i.direction === "inbound").map((i) => Date.parse(i.occurredAt)).sort((a, b) => b - a)[0];
  if (last === undefined || Date.now() - last > WINDOW_MS) throw new ProviderError("The demo network accepts a reply only within 24 h of the customer's last message.", { category: "policy", providerCode: "window_closed" });
}

export async function reply(channelRemoteId: string, req: ReplyRequest): Promise<ReplyResult> {
  seed(channelRemoteId);
  const s = store();
  const existing = s.replies.get(req.idempotencyKey);
  if (existing) return existing;
  if (/\bforbidden\b/i.test(req.text)) throw new ProviderError("The demo network rejected this reply.", { category: "policy" });
  if (req.kind === "message") assertWindowOpen(channelRemoteId, req.threadRemoteId);
  const result = { remoteId: `${req.threadRemoteId}-r${++s.seq}`, sentAt: now() };
  s.replies.set(req.idempotencyKey, result);
  s.items.get(channelRemoteId)!.push({ remoteId: result.remoteId, threadRemoteId: req.threadRemoteId, kind: req.kind, direction: "outbound", author: { remoteId: channelRemoteId, name: "Demo Brand" }, text: req.text, occurredAt: result.sentAt, inReplyToRemoteId: req.inReplyToRemoteId });
  if (s.ambiguousReply) throw new ProviderError("Provider request timed out", { category: "temporary", ambiguous: true });
  return result;
}

/**
 * Client reference first; otherwise the structural match every real network
 * without one has to use: our own outbound reply, same thread, same text,
 * created at or after the attempt started.
 */
export async function findReply(channelRemoteId: string, lookup: ReplyLookup): Promise<ReplyResult | null> {
  const byKey = store().replies.get(lookup.idempotencyKey);
  if (byKey) return byKey;
  const hit = (store().items.get(channelRemoteId) ?? []).find(
    (i) => i.direction === "outbound" && i.threadRemoteId === lookup.threadRemoteId && i.text === lookup.text && i.occurredAt >= lookup.sentAfter,
  );
  return hit ? { remoteId: hit.remoteId, sentAt: hit.occurredAt } : null;
}

/** Hide or show a comment. A comment whose text says "unhideable" is refused, so the failure path can be exercised. */
export async function hideItem(channelRemoteId: string, req: ModerationRequest): Promise<ModerationResult> {
  seed(channelRemoteId);
  if (req.kind !== "comment") throw new ProviderError("Only comments can be hidden on the demo network.", { category: "validation", providerCode: "kind_unsupported" });
  const item = (store().items.get(channelRemoteId) ?? []).find((i) => i.remoteId === req.remoteId);
  if (!item) throw new ProviderError("The demo network has no such comment.", { category: "deleted" });
  if (/\bunhideable\b/i.test(item.text)) throw new ProviderError("The demo network refused to hide this comment.", { category: "policy" });
  if (req.hide) store().hidden.add(req.remoteId);
  else store().hidden.delete(req.remoteId);
  return { remoteId: req.remoteId, hidden: req.hide, at: now() };
}

/*
 * Mock inbox: deterministic seed conversations per channel plus an inject
 * hook so the UI/worker loop (poll → ingest → reply → reconcile) can be
 * exercised locally.
 */
import type { InboxItem, InboxItemKind, InboxPage, ReplyRequest, ReplyResult } from "../inbox-types";
import { ProviderError } from "../types";

type Store = { items: Map<string, InboxItem[]>; replies: Map<string, ReplyResult>; seeded: Set<string>; ambiguousReply?: boolean; seq: number };
const g = globalThis as unknown as { __misMockInbox?: Store };
const store = (): Store => (g.__misMockInbox ??= { items: new Map(), replies: new Map(), seeded: new Set(), seq: 0 });
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
  /** Simulate a customer writing in (new thread when threadRemoteId is omitted). */
  inject(channelRemoteId: string, input: { text: string; kind?: InboxItemKind; threadRemoteId?: string; who?: number }): InboxItem {
    seed(channelRemoteId);
    const s = store();
    const who = PEOPLE[(input.who ?? s.seq) % PEOPLE.length];
    const thread = input.threadRemoteId ?? `${channelRemoteId}-t${Date.now().toString(36)}`;
    const item: InboxItem = { remoteId: `${thread}-m${++s.seq}-${Date.now().toString(36)}`, threadRemoteId: thread, kind: input.kind ?? "message", direction: "inbound", author: who, text: input.text, occurredAt: now() };
    s.items.get(channelRemoteId)!.push(item);
    return item;
  },
  threads(channelRemoteId: string) { seed(channelRemoteId); return [...new Set((store().items.get(channelRemoteId) ?? []).map((i) => i.threadRemoteId))]; },
};

export async function fetchInbox(channelRemoteId: string, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  seed(channelRemoteId);
  const all = store().items.get(channelRemoteId) ?? [];
  const since = opts.since ? Date.parse(opts.since) : 0;
  return { items: all.filter((i) => Date.parse(i.occurredAt) > since).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

export async function reply(channelRemoteId: string, req: ReplyRequest): Promise<ReplyResult> {
  seed(channelRemoteId);
  const s = store();
  const existing = s.replies.get(req.idempotencyKey);
  if (existing) return existing;
  if (/\bforbidden\b/i.test(req.text)) throw new ProviderError("The demo network rejected this reply.", { category: "policy" });
  const result = { remoteId: `${req.threadRemoteId}-r${++s.seq}`, sentAt: now() };
  s.replies.set(req.idempotencyKey, result);
  s.items.get(channelRemoteId)!.push({ remoteId: result.remoteId, threadRemoteId: req.threadRemoteId, kind: req.kind, direction: "outbound", author: { remoteId: channelRemoteId, name: "Demo Brand" }, text: req.text, occurredAt: result.sentAt, inReplyToRemoteId: req.inReplyToRemoteId });
  if (s.ambiguousReply) throw new ProviderError("Provider request timed out", { category: "temporary", ambiguous: true });
  return result;
}

export async function findReply(idempotencyKey: string): Promise<ReplyResult | null> {
  return store().replies.get(idempotencyKey) ?? null;
}

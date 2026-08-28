import { afterEach, describe, expect, it, vi } from "vitest";
import { createXProvider } from "./index";
import { capsFor } from "./client";
import { dmToItem, tweetToItem, type XDmEvent, type XTweet } from "./inbox";
import { tweetToFacts } from "./insights";
import type { ChannelDescriptor, Credential } from "../types";

const cfg = { clientId: "id", clientSecret: "secret" };
const x = createXProvider(cfg);
const BASE = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"];
const cred: Credential = { accessToken: "tok", scopes: BASE, providerUserId: "u1" };
const dmCred: Credential = { ...cred, scopes: [...BASE, "dm.read", "dm.write"] };
const ch: ChannelDescriptor = { remoteId: "u1", kind: "x_account", network: "x", name: "Acme", handle: "@acme", capabilities: capsFor(cred) };
const dmCh: ChannelDescriptor = { ...ch, capabilities: capsFor(dmCred) };

const INCLUDES = { users: [{ id: "u2", name: "Jo Rivera", username: "jo", profile_image_url: "https://img.test/jo.png" }] };
/* Shapes from the v2 users/:id/mentions and dm_events references. */
const MENTION: XTweet = { id: "t100", text: "@acme love this", created_at: "2026-08-27T12:00:00Z", author_id: "u2", conversation_id: "c1" };
const REPLY: XTweet = { ...MENTION, id: "t101", text: "@acme and one more thing", created_at: "2026-08-27T12:05:00Z", referenced_tweets: [{ type: "replied_to", id: "t50" }] };
const DM: XDmEvent = { id: "d1", event_type: "MessageCreate", text: "Is this in stock?", created_at: "2026-08-27T13:00:00Z", sender_id: "u2", dm_conversation_id: "dc1" };

function stub(routes: Record<string, () => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { title: "Not Found Error" } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("X inbox parsing", () => {
  it("threads on conversation_id and calls a reply to our post a comment, a bare mention a mention", () => {
    const mention = tweetToItem(MENTION, INCLUDES, ch);
    expect(mention).toMatchObject({ remoteId: "t100", threadRemoteId: "c1", kind: "mention", direction: "inbound", postRemoteId: "c1" });
    expect(mention.author).toMatchObject({ remoteId: "u2", name: "Jo Rivera", handle: "@jo", profileUrl: "https://x.com/jo" });
    expect(tweetToItem(REPLY, INCLUDES, ch)).toMatchObject({ kind: "comment", inReplyToRemoteId: "t50", postRemoteId: "t50", threadRemoteId: "c1" });
    expect(tweetToItem({ ...MENTION, author_id: "u1" }, INCLUDES, ch).direction).toBe("outbound");
  });

  it("maps DM events and ignores non-message events", () => {
    expect(dmToItem(DM, INCLUDES, ch)).toMatchObject({ remoteId: "d1", threadRemoteId: "dc1", kind: "message", direction: "inbound", text: "Is this in stock?" });
    expect(dmToItem({ ...DM, event_type: "ParticipantsJoin" }, INCLUDES, ch)).toBeNull();
  });

  it("returns the mentions newest_id as the cursor and replays it as since_id", async () => {
    const calls = stub({ "/users/u1/mentions": () => ({ body: { data: [MENTION, REPLY], includes: INCLUDES, meta: { newest_id: "t101" } } }) });
    const page = await x.fetchInbox!(cred, ch, {});
    expect(page.items.map((i) => i.remoteId)).toEqual(["t100", "t101"]);
    expect(page.cursor).toBe("t101");
    await x.fetchInbox!(cred, ch, { cursor: "t101" });
    expect(calls[1].url).toContain("since_id=t101");
  });

  it("skips DMs entirely unless dm.read was granted", async () => {
    stub({ "/users/u1/mentions": () => ({ body: { data: [], meta: {} } }), "/dm_events": () => ({ body: { data: [DM], includes: INCLUDES } }) });
    expect((await x.fetchInbox!(cred, ch, {})).items).toEqual([]);
    expect((await x.fetchInbox!(dmCred, dmCh, {})).items.map((i) => i.kind)).toEqual(["message"]);
    expect(ch.capabilities.reasons?.messages).toMatch(/dm\.read/);
  });
});

describe("X replies", () => {
  it("replies to a mention as a post in the same thread", async () => {
    const calls = stub({ "/2/tweets": () => ({ body: { data: { id: "t200", created_at: "2026-08-28T07:00:00Z" } } }) });
    const r = await x.reply!(cred, ch, { kind: "mention", threadRemoteId: "c1", inReplyToRemoteId: "t100", text: "Thank you!", idempotencyKey: "k" });
    expect(r).toMatchObject({ remoteId: "t200", sentAt: "2026-08-28T07:00:00Z" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: "Thank you!", reply: { in_reply_to_tweet_id: "t100" } });
  });

  it("replies to a DM into its conversation, and refuses without the scope", async () => {
    const calls = stub({ "/dm_conversations/dc1/messages": () => ({ body: { data: { dm_event_id: "d9" } } }) });
    const r = await x.reply!(dmCred, dmCh, { kind: "message", threadRemoteId: "dc1", text: "In stock now.", idempotencyKey: "k" });
    expect(r.remoteId).toBe("d9");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: "In stock now." });
    await expect(x.reply!(cred, ch, { kind: "message", threadRemoteId: "dc1", text: "hi", idempotencyKey: "k" })).rejects.toMatchObject({ category: "permission", providerCode: "dm_scope_missing" });
  });

  it("reconciles an ambiguous reply structurally rather than resending", async () => {
    const ours: XTweet = { id: "t201", text: "Thank you!", created_at: "2026-08-28T07:00:00Z", author_id: "u1", conversation_id: "c1" };
    stub({ "/users/u1/tweets": () => ({ body: { data: [ours], includes: INCLUDES } }) });
    const lookup = { kind: "mention" as const, threadRemoteId: "c1", text: "Thank you!", idempotencyKey: "k", sentAfter: "2026-08-28T06:59:00Z" };
    expect(await x.findReply!(cred, ch, lookup)).toMatchObject({ remoteId: "t201" });
    expect(await x.findReply!(cred, ch, { ...lookup, text: "Something else" })).toBeNull();
    expect(await x.findReply!(cred, ch, { ...lookup, sentAfter: "2026-08-28T08:00:00Z" })).toBeNull();
  });
});

describe("X insights parsing", () => {
  it("prefers organic metrics, folds quotes into shares and ignores profile clicks", () => {
    const facts = tweetToFacts(
      {
        id: "t1",
        public_metrics: { impression_count: 900, like_count: 40, reply_count: 5, retweet_count: 7, quote_count: 3, bookmark_count: 11 },
        organic_metrics: { impression_count: 1000, like_count: 42, url_link_clicks: 25, user_profile_clicks: 9 },
        non_public_metrics: { url_link_clicks: 25 },
      },
      "2026-08-27",
    );
    expect(facts).toContainEqual({ entity: "post", remoteId: "t1", metric: "impressions", day: "2026-08-27", value: 1000, source: "x.organic_metrics.impression_count" });
    expect(facts).toContainEqual({ entity: "post", remoteId: "t1", metric: "reactions", day: "2026-08-27", value: 42, source: "x.organic_metrics.like_count" });
    expect(facts.find((f) => f.metric === "shares")).toMatchObject({ value: 10, source: "x.public_metrics.retweet_count" });
    expect(facts.find((f) => f.metric === "link_clicks")).toMatchObject({ value: 25, source: "x.organic_metrics.url_link_clicks" });
    expect(facts.some((f) => f.source.includes("user_profile_clicks"))).toBe(false);
  });

  it("falls back to public metrics on posts older than the organic-metrics window", () => {
    const facts = tweetToFacts({ id: "t2", public_metrics: { impression_count: 500, like_count: 3 } }, "2026-08-27");
    expect(facts.map((f) => f.source)).toEqual(["x.public_metrics.impression_count", "x.public_metrics.like_count"]);
  });

  it("records the follower count as a channel snapshot on the fetch day", async () => {
    stub({ "/users/me": () => ({ body: { data: { public_metrics: { followers_count: 8123 } } } }) });
    const page = await x.fetchInsights!(cred, ch, { since: "2026-08-20", until: "2026-08-27" });
    expect(page.facts).toContainEqual({ entity: "channel", metric: "followers", day: "2026-08-27", value: 8123, source: "x.public_metrics.followers_count" });
  });
});

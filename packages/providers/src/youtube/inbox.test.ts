import { afterEach, describe, expect, it, vi } from "vitest";
import { createYouTubeProvider } from "./index";
import { capsFor } from "./client";
import { threadsToItems, type YtThread } from "./inbox";
import { reportToFacts } from "./insights";
import type { ChannelDescriptor, Credential } from "../types";

const yt = createYouTubeProvider({ clientId: "id", clientSecret: "secret" });
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
const cred: Credential = { accessToken: "tok", scopes: SCOPES, providerUserId: "UC_me" };
const ch: ChannelDescriptor = { remoteId: "UC_me", kind: "youtube_channel", network: "youtube", name: "Acme", capabilities: capsFor(cred) };

function stub(routes: Record<string, () => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { error: { errors: [{ reason: "notFound" }] } } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

/* Shapes from the Data API commentThreads.list reference (part=snippet,replies). */
const THREADS: YtThread[] = [
  {
    id: "thread-1",
    snippet: { videoId: "vid_1", totalReplyCount: 1 },
    replies: {
      comments: [
        { id: "reply-1", snippet: { parentId: "top-1", videoId: "vid_1", textOriginal: "Thanks for watching!", publishedAt: "2026-08-27T12:05:00Z", authorDisplayName: "Acme", authorChannelId: { value: "UC_me" } } },
      ],
    },
  },
];
const withTop = (): YtThread[] => [
  {
    ...THREADS[0],
    snippet: {
      ...THREADS[0].snippet,
      topLevelComment: { id: "top-1", snippet: { videoId: "vid_1", textOriginal: "Great video", publishedAt: "2026-08-27T12:00:00Z", authorDisplayName: "Jo", authorChannelId: { value: "UC_jo" }, authorProfileImageUrl: "https://img.test/jo.png" } },
    },
  },
];

describe("YouTube inbox parsing", () => {
  it("threads replies under the top-level comment and marks our own as outbound", () => {
    const items = threadsToItems(withTop(), ch);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ remoteId: "top-1", threadRemoteId: "top-1", kind: "comment", direction: "inbound", postRemoteId: "vid_1", postUrl: "https://www.youtube.com/watch?v=vid_1", text: "Great video" });
    expect(items[0].author).toMatchObject({ remoteId: "UC_jo", name: "Jo", avatarUrl: "https://img.test/jo.png" });
    expect(items[1]).toMatchObject({ remoteId: "reply-1", threadRemoteId: "top-1", inReplyToRemoteId: "top-1", direction: "outbound" });
    expect(items[1].author).toMatchObject({ remoteId: "UC_me", name: "Acme" });
  });

  it("drops items at or before the since watermark and passes the page token through", async () => {
    stub({ "/commentThreads": () => ({ body: { items: withTop(), nextPageToken: "page-2" } }) });
    const all = await yt.fetchInbox!(cred, ch, {});
    expect(all.items).toHaveLength(2);
    expect(all.cursor).toBe("page-2");
    const since = await yt.fetchInbox!(cred, ch, { since: "2026-08-27T12:00:00Z" });
    expect(since.items.map((i) => i.remoteId)).toEqual(["reply-1"]);
  });

  it("returns nothing when the channel never granted force-ssl", async () => {
    const readOnly: ChannelDescriptor = { ...ch, capabilities: capsFor({ ...cred, scopes: ["https://www.googleapis.com/auth/youtube.readonly"] }) };
    expect(await yt.fetchInbox!(cred, readOnly, {})).toEqual({ items: [] });
  });
});

describe("YouTube replies", () => {
  it("posts comments.insert against the thread's top-level comment", async () => {
    const calls = stub({ "/comments?part=snippet": () => ({ body: { id: "reply-9", snippet: { publishedAt: "2026-08-28T07:00:00Z" } } }) });
    const r = await yt.reply!(cred, ch, { kind: "comment", threadRemoteId: "top-1", text: "Appreciated", idempotencyKey: "k" });
    expect(r).toMatchObject({ remoteId: "reply-9", sentAt: "2026-08-28T07:00:00Z" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ snippet: { parentId: "top-1", textOriginal: "Appreciated" } });
    await expect(yt.reply!(cred, ch, { kind: "message", threadRemoteId: "t", text: "dm", idempotencyKey: "k" })).rejects.toMatchObject({ category: "permission" });
  });

  it("reconciles an ambiguous reply structurally: our comment, same thread, same text, after the attempt", async () => {
    stub({ "/commentThreads": () => ({ body: { items: withTop() } }) });
    const lookup = { kind: "comment" as const, threadRemoteId: "top-1", text: "Thanks for watching!", idempotencyKey: "k", sentAfter: "2026-08-27T12:00:00Z" };
    expect(await yt.findReply!(cred, ch, lookup)).toMatchObject({ remoteId: "reply-1" });
    expect(await yt.findReply!(cred, ch, { ...lookup, text: "different" })).toBeNull();
    expect(await yt.findReply!(cred, ch, { ...lookup, sentAfter: "2026-08-27T13:00:00Z" })).toBeNull();
  });
});

/* Shape from the YouTube Analytics API reports.query reference. */
describe("YouTube insights parsing", () => {
  it("maps a day report and derives net follower growth from gained minus lost", () => {
    const facts = reportToFacts(
      {
        columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }, { name: "comments" }, { name: "shares" }, { name: "videosAddedToPlaylists" }, { name: "subscribersGained" }, { name: "subscribersLost" }],
        rows: [["2026-08-20", 1200, 90, 12, 5, 8, 30, 4]],
      },
      "channel",
      "2026-08-27",
    );
    expect(facts).toContainEqual({ entity: "channel", remoteId: undefined, metric: "video_views", day: "2026-08-20", value: 1200, source: "youtube.analytics.views" });
    expect(facts).toContainEqual({ entity: "channel", remoteId: undefined, metric: "saves", day: "2026-08-20", value: 8, source: "youtube.analytics.videosAddedToPlaylists" });
    expect(facts.find((f) => f.metric === "follower_gain")).toMatchObject({ value: 26 });
  });

  it("keys per-video rows on the video dimension and falls back to the window's last day", () => {
    const facts = reportToFacts({ columnHeaders: [{ name: "video" }, { name: "views" }, { name: "likes" }], rows: [["vid_1", 500, 40]] }, "post", "2026-08-27");
    expect(facts).toEqual([
      { entity: "post", remoteId: "vid_1", metric: "video_views", day: "2026-08-27", value: 500, source: "youtube.analytics.views" },
      { entity: "post", remoteId: "vid_1", metric: "reactions", day: "2026-08-27", value: 40, source: "youtube.analytics.likes" },
    ]);
  });

  it("reports missing scopes and dead tokens via healthCheck", async () => {
    stub({ "/channels?part=id": () => ({ body: { items: [{ id: "UC_me" }] } }) });
    const partial = await yt.healthCheck!({ ...cred, scopes: ["https://www.googleapis.com/auth/youtube.readonly"] }, ch);
    expect(partial).toMatchObject({ tokenOk: true, permissionsOk: false, missingScopes: ["https://www.googleapis.com/auth/youtube.upload"] });
    stub({ "/channels?part=id": () => ({ status: 401, body: { error: { errors: [{ reason: "authError" }], message: "Invalid Credentials" } } }) });
    expect(await yt.healthCheck!(cred, ch)).toMatchObject({ tokenOk: false });
  });
});

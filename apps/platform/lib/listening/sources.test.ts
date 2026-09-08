import { afterEach, describe, expect, it, vi } from "vitest";
import { AD_SOURCES, LISTENING_COVERAGE, LISTENING_NETWORKS } from "./coverage";
import { archivedAdToItem, searchMetaAds } from "./ads/meta";
import { bskyToItem, searchBluesky } from "./sources/bluesky";
import { searchThreads, threadsToItem } from "./sources/threads";
import { searchYouTube, ytToItem } from "./sources/youtube";

function stub(routes: Record<string, (url: string, init?: RequestInit) => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key](url, init) : { status: 404, body: { error: "no route" } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("coverage", () => {
  it("cites a document for every network and source that is covered, and gives a reason for every one that is not", () => {
    for (const [k, c] of Object.entries(LISTENING_COVERAGE)) {
      if (c.covered) expect(c.doc, k).toMatch(/^https?:\/\//);
      expect(c.how, k).toMatch(/\w+\.$/);
    }
    for (const n of LISTENING_NETWORKS) expect(LISTENING_COVERAGE[n].covered).toBe(true);
    for (const [k, c] of Object.entries(AD_SOURCES)) expect(c.doc, k).toMatch(/^https?:\/\//);
  });
});

describe("bluesky", () => {
  it("searches as the connected account through its service host, newest first with a since date, and maps posts to items", async () => {
    const calls = stub({ "app.bsky.feed.searchPosts": () => ({ body: { posts: [{ uri: "at://did:plc:1/app.bsky.feed.post/3k2", author: { handle: "mara.codes", displayName: "Mara" }, record: { text: "Northwind pour-over is back", createdAt: "2026-09-06T08:00:00Z" } }, { uri: "at://x", author: {} }], cursor: "c1" } }) });
    const page = await searchBluesky("jwt", { term: "northwind", since: new Date("2026-09-01T00:00:00Z"), limit: 25 });
    expect(page.items).toEqual([{ network: "bluesky", remoteId: "at://did:plc:1/app.bsky.feed.post/3k2", author: { name: "Mara", handle: "@mara.codes", url: "https://bsky.app/profile/mara.codes" }, text: "Northwind pour-over is back", url: "https://bsky.app/profile/mara.codes/post/3k2", occurredAt: "2026-09-06T08:00:00Z" }]);
    expect(page.cursor).toBe("c1");
    const q = new URL(calls[0].url).searchParams;
    expect(calls[0].url.startsWith("https://bsky.social/xrpc/app.bsky.feed.searchPosts")).toBe(true);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect([q.get("q"), q.get("sort"), q.get("since"), q.get("limit")]).toEqual(["northwind", "latest", "2026-09-01T00:00:00.000Z", "25"]);
    expect(bskyToItem({ uri: "at://x" })).toBeNull();
  });
});

describe("threads and youtube", () => {
  it("searches Threads recent public posts with the token and maps them", async () => {
    const calls = stub({ "graph.threads.net/v1.0/keyword_search": () => ({ body: { data: [{ id: "17", text: "hot take", permalink: "https://www.threads.net/@jules/post/abc", timestamp: "2026-09-06T07:00:00+0000", username: "jules" }], paging: { cursors: { after: "n2" } } } }) });
    const page = await searchThreads("tok", { term: "northwind coffee", since: new Date("2026-09-01T00:00:00Z"), limit: 25 });
    expect(page.items[0]).toMatchObject({ network: "threads", remoteId: "17", author: { handle: "@jules" }, url: "https://www.threads.net/@jules/post/abc" });
    const q = new URL(calls[0].url).searchParams;
    expect([q.get("search_type"), q.get("since"), q.get("access_token")]).toEqual(["RECENT", String(Math.floor(Date.parse("2026-09-01T00:00:00Z") / 1000)), "tok"]);
    expect(threadsToItem({ id: "1" })).toBeNull();
  });

  it("searches YouTube videos by date with a bearer token and joins title and description", async () => {
    const calls = stub({ "youtube/v3/search": () => ({ body: { items: [{ id: { videoId: "v1" }, snippet: { publishedAt: "2026-09-05T00:00:00Z", channelId: "UC1", channelTitle: "Valley Eats", title: "Coffee crawl", description: "Northwind and more" } }, { id: {} }], nextPageToken: "p2" } }) });
    const page = await searchYouTube("tok", { term: "northwind", since: new Date("2026-09-01T00:00:00Z"), limit: 25 });
    expect(page.items).toEqual([{ network: "youtube", remoteId: "v1", author: { name: "Valley Eats", url: "https://www.youtube.com/channel/UC1" }, text: "Coffee crawl — Northwind and more", url: "https://www.youtube.com/watch?v=v1", occurredAt: "2026-09-05T00:00:00Z" }]);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(new URL(calls[0].url).searchParams.get("type")).toBe("video");
    expect(ytToItem({ id: {} })).toBeNull();
  });
});

describe("meta ad library", () => {
  it("asks ads_archive for all ad types that reached the country and maps the archived ad", async () => {
    const calls = stub({ "/ads_archive": () => ({ body: { data: [{ id: "9", page_name: "Brew Bros", ad_creative_bodies: ["Cold brew subscriptions"], ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=9", ad_delivery_start_time: "2026-08-12", publisher_platforms: ["facebook", "instagram"], eu_total_reach: 41200 }], paging: { cursors: { after: "c" } } } }) });
    const page = await searchMetaAds("tok", "secret", { term: "brew bros", country: "DE", days: 90 });
    expect(page.items[0]).toMatchObject({ source: "meta", id: "9", advertiser: "Brew Bros", text: "Cold brew subscriptions", reach: 41200, platforms: ["facebook", "instagram"] });
    const q = new URL(calls[0].url).searchParams;
    expect([q.get("ad_reached_countries"), q.get("ad_type"), q.get("search_terms")]).toEqual(['["DE"]', "ALL", "brew bros"]);
    expect(q.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
    expect(archivedAdToItem({})).toBeNull();
  });

  it("surfaces Meta's refusal in its own words and treats 613 as a rate limit", async () => {
    stub({ "/ads_archive": () => ({ status: 400, body: { error: { message: "(#10) Application does not have permission for this action", code: 10 } } }) });
    await expect(searchMetaAds("tok", undefined, { term: "x", country: "DE", days: 30 })).rejects.toMatchObject({ message: "(#10) Application does not have permission for this action" });
    stub({ "/ads_archive": () => ({ status: 400, body: { error: { message: "Calls to this api have exceeded the rate limit.", code: 613 } } }) });
    await expect(searchMetaAds("tok", undefined, { term: "x", country: "DE", days: 30 })).rejects.toMatchObject({ category: "rate_limit" });
  });
});

describe("terms", () => {
  it("splits on commas and lines, keeps quotes, drops duplicates case-insensitively, and caps at ten of eighty characters", async () => {
    const { parseTerms } = await import("./terms");
    expect(parseTerms('northwind, "northwind coffee"\n Northwind ,, #roast')).toEqual(["northwind", '"northwind coffee"', "#roast"]);
    expect(parseTerms(Array.from({ length: 12 }, (_, i) => `t${i}`).join(","))).toHaveLength(10);
    expect(parseTerms("x".repeat(100))[0]).toHaveLength(80);
  });
});

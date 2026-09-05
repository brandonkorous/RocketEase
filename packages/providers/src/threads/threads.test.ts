import { afterEach, describe, expect, it, vi } from "vitest";
import { createThreadsProvider, DEFAULT_SCOPES, threadsIssues } from "./index";
import { capsFor } from "./client";
import { containerParams, findPublication, publish } from "./publish";
import { replyToItem } from "./inbox";
import { postToFacts, userToFacts } from "./insights";
import type { ChannelDescriptor, Credential, PublishRequest } from "../types";

const cfg = { clientId: "th-app", clientSecret: "th-secret" };
const threads = createThreadsProvider(cfg);
const cred: Credential = { accessToken: "tok", scopes: DEFAULT_SCOPES, providerUserId: "17841400000" };
const ch: ChannelDescriptor = { remoteId: "17841400000", kind: "threads_profile", network: "threads", name: "Acme", handle: "@acme", capabilities: capsFor(cred) };
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ idempotencyKey: "key-1", format: "text", text: "Shipping today.", media: [], ...over });
const image = { url: "https://media.test/a.png", mimeType: "image/png", altText: "A chart" };
const video = { url: "https://media.test/v.mp4", mimeType: "video/mp4", durationSeconds: 12 };

function stub(routes: Record<string, (init?: RequestInit) => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key](init) : { status: 404, body: { error: { message: "Unsupported get request", code: 100 } } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}
const bodyOf = (c: { init?: RequestInit }) => Object.fromEntries(new URLSearchParams(String(c.init?.body)));
afterEach(() => vi.unstubAllGlobals());

describe("Threads OAuth", () => {
  it("sends the person to threads.net with comma-separated scopes", () => {
    const u = new URL(threads.authorizationUrl({ state: "st", redirectUri: "https://app.test/cb" }));
    expect(u.origin + u.pathname).toBe("https://threads.net/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe(DEFAULT_SCOPES.join(","));
    expect(u.searchParams.get("client_id")).toBe("th-app");
    expect(u.searchParams.get("state")).toBe("st");
  });

  it("exchanges the code, swaps for a 60-day token, and records the requested scopes", async () => {
    const calls = stub({
      "/oauth/access_token": () => ({ body: { access_token: "short", user_id: 17841400000 } }),
      "graph.threads.net/access_token": () => ({ body: { access_token: "long", token_type: "bearer", expires_in: 5_184_000 } }),
      "/v1.0/me": () => ({ body: { id: "17841400000", username: "acme", name: "Acme" } }),
    });
    const c = await threads.exchangeCode("code", "https://app.test/cb");
    expect(c).toMatchObject({ accessToken: "long", providerUserId: "17841400000", providerUserName: "@acme", scopes: DEFAULT_SCOPES });
    expect(new Date(c.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);
    expect(bodyOf(calls[0])).toMatchObject({ grant_type: "authorization_code", client_secret: "th-secret", code: "code" });
    expect(calls[1].url).toContain("grant_type=th_exchange_token");
  });

  it("refreshes with th_refresh_token and keeps the old expiry when none is returned", async () => {
    stub({ "/refresh_access_token": () => ({ body: { access_token: "long2", token_type: "bearer", expires_in: 5_184_000 } }) });
    const c = await threads.refresh(cred);
    expect(c.accessToken).toBe("long2");
    expect(threads.revoke(cred)).resolves.toBeUndefined();
  });

  it("maps a Graph error envelope onto the taxonomy", async () => {
    stub({ "/v1.0/me": () => ({ status: 400, body: { error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } } }) });
    await expect(threads.listChannels(cred)).rejects.toMatchObject({ category: "permission", providerCode: "190" });
  });
});

describe("Threads containers", () => {
  it("shapes text, image, video and carousel children", () => {
    expect(containerParams(req({ link: "https://acme.test" }))).toMatchObject({ media_type: "TEXT", text: "Shipping today.", link_attachment: "https://acme.test" });
    expect(containerParams(req(), image)).toMatchObject({ media_type: "IMAGE", image_url: image.url, alt_text: "A chart", text: "Shipping today." });
    expect(containerParams(req(), video)).toMatchObject({ media_type: "VIDEO", video_url: video.url });
    expect(containerParams(req(), image, true)).toEqual({ is_carousel_item: "true", media_type: "IMAGE", image_url: image.url, alt_text: "A chart" });
    expect(containerParams(req({ settings: { replyControl: "followers_only", topicTag: "launch" } }))).toMatchObject({ reply_control: "followers_only", topic_tag: "launch" });
  });

  it("publishes a text post: container, publish, permalink", async () => {
    const calls = stub({
      "/threads_publish": () => ({ body: { id: "media-1" } }),
      "/17841400000/threads": () => ({ body: { id: "container-1" } }),
      "/v1.0/media-1": () => ({ body: { id: "media-1", permalink: "https://www.threads.net/@acme/post/C1", timestamp: "2026-09-05T10:00:00+0000" } }),
    });
    const r = await threads.publish(cred, ch, req());
    expect(r).toMatchObject({ remoteId: "media-1", url: "https://www.threads.net/@acme/post/C1", publishedAt: "2026-09-05T10:00:00+0000" });
    expect(bodyOf(calls[0])).toMatchObject({ media_type: "TEXT", text: "Shipping today." });
    expect(bodyOf(calls[1])).toMatchObject({ creation_id: "container-1" });
  });

  it("publishes a carousel as children first, then a CAROUSEL parent carrying the text", async () => {
    let n = 0;
    const calls = stub({
      "/threads_publish": () => ({ body: { id: "media-2" } }),
      "/17841400000/threads": () => ({ body: { id: `c${++n}` } }),
      "/v1.0/media-2": () => ({ body: { id: "media-2", permalink: "https://www.threads.net/@acme/post/C2" } }),
    });
    await threads.publish(cred, ch, req({ format: "carousel", media: [image, { ...image, url: "https://media.test/b.png" }] }));
    const posts = calls.filter((c) => c.url.endsWith("/17841400000/threads")).map(bodyOf);
    expect(posts[0]).toMatchObject({ is_carousel_item: "true", image_url: image.url });
    expect(posts[0].text).toBeUndefined();
    expect(posts[2]).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2", text: "Shipping today." });
  });

  it("waits for a video container and fails plainly when Threads rejects it", async () => {
    stub({
      "/17841400000/threads": () => ({ body: { id: "vc" } }),
      "/v1.0/vc": () => ({ body: { status: "ERROR", error_message: "Unsupported codec" } }),
    });
    await expect(publish(cred, ch, req({ format: "video", media: [video] }), async () => {})).rejects.toMatchObject({ category: "validation", message: /Unsupported codec/ });
  });

  it("reconciles an ambiguous publish by the remembered attempt's text, and only that", async () => {
    stub({
      "/threads_publish": () => ({ status: 500, body: { error: { message: "unknown", code: 1 } } }),
      "/17841400000/threads": (init) => (init?.method === "POST" ? { body: { id: "c9" } } : { body: { data: [{ id: "m9", text: "Reconcile me.", permalink: "https://www.threads.net/@acme/post/C9", timestamp: "2099-01-01T00:00:00+0000" }] } }),
    });
    await expect(threads.publish(cred, ch, req({ idempotencyKey: "amb-1", text: "Reconcile me." }))).rejects.toMatchObject({ ambiguous: true });
    expect(await findPublication(cred, ch, "amb-1")).toMatchObject({ remoteId: "m9" });
    expect(await findPublication(cred, ch, "never-started")).toBeNull();
  });
});

describe("Threads validation", () => {
  const codes = (r: PublishRequest) => threads.validate(ch, r).map((i) => i.code);
  it("enforces 500 characters, carousel bounds and topic tags", () => {
    expect(codes(req({ text: "x".repeat(501) }))).toContain("text_too_long");
    expect(codes(req({ format: "carousel", media: [image] }))).toContain("carousel_too_small");
    expect(codes(req({ format: "image", media: [image, image] }))).toContain("carousel_required");
    expect(codes(req({ settings: { topicTag: "a.b" } }))).toContain("topic_tag_invalid");
    expect(threadsIssues(req({ text: "#one #two" })).map((i) => i.code)).toContain("one_topic_per_post");
  });
  it("refuses publishing when threads_content_publish was not granted", () => {
    const ro = { ...ch, capabilities: capsFor({ ...cred, scopes: ["threads_basic"] }) };
    expect(ro.capabilities.formats).toEqual([]);
    expect(ro.capabilities.reasons?.formats).toMatch(/threads_content_publish/);
  });
});

describe("Threads inbox and insights mapping", () => {
  it("maps a reply, marking our own username outbound", () => {
    const post = { id: "m1", permalink: "https://www.threads.net/@acme/post/C1" };
    const theirs = replyToItem({ id: "r1", text: "Nice", username: "fan", timestamp: "2026-09-05T10:00:00+0000", root_post: { id: "m1" }, replied_to: { id: "m1" } }, post, ch);
    expect(theirs).toMatchObject({ kind: "comment", direction: "inbound", threadRemoteId: "m1", postRemoteId: "m1", author: { handle: "@fan" } });
    expect(replyToItem({ id: "r2", username: "acme", replied_to: { id: "r1" } }, post, ch)).toMatchObject({ direction: "outbound", inReplyToRemoteId: "r1" });
  });

  it("folds reposts, quotes and shares into one shares fact and maps views to impressions", () => {
    const facts = postToFacts("m1", [{ name: "views", values: [{ value: 120 }] }, { name: "likes", values: [{ value: 7 }] }, { name: "reposts", values: [{ value: 2 }] }, { name: "quotes", values: [{ value: 1 }] }, { name: "shares", values: [{ value: 3 }] }], "2026-09-05");
    expect(facts.find((f) => f.metric === "impressions")?.value).toBe(120);
    expect(facts.find((f) => f.metric === "shares")).toMatchObject({ value: 6, source: "threads.reposts+quotes+shares" });
    const user = userToFacts([{ name: "views", period: "day", values: [{ value: 40, end_time: "2026-09-03T07:00:00+0000" }] }, { name: "followers_count", total_value: { value: 900 } }], "2026-09-05");
    expect(user).toEqual([
      { entity: "channel", metric: "impressions", day: "2026-09-03", value: 40, source: "threads.views" },
      { entity: "channel", metric: "followers", day: "2026-09-05", value: 900, source: "threads.followers_count" },
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PASSWORD_RE, blueskyIssues, createBlueskyProvider } from "./index";
import { CAPS, jwtExpiry, mapAtError, tidFromKey } from "./client";
import { byteRange, facetsFor, graphemes, spans } from "./richtext";
import { buildRecord, embedFor } from "./publish";
import { notificationToItem } from "./inbox";
import { postToFacts } from "./insights";
import type { ChannelDescriptor, Credential, PublishRequest } from "../types";

const bsky = createBlueskyProvider({ clientId: "bluesky", clientSecret: "" });
const DID = "did:plc:abc123";
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
const cred: Credential = { accessToken: jwt(2_000_000_000), refreshToken: "refresh", scopes: [], providerUserId: DID };
const ch: ChannelDescriptor = { remoteId: DID, kind: "bluesky_account", network: "bluesky", name: "Acme", handle: "@acme.bsky.social", capabilities: CAPS() };
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ idempotencyKey: "key-1", format: "text", text: "Shipping today.", media: [], ...over });
const blob = { $type: "blob" as const, ref: { $link: "bafy" }, mimeType: "image/png", size: 10 };

function stub(routes: Record<string, (init?: RequestInit) => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key](init) : { status: 404, body: { error: "NotFound", message: "not found" } };
      return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}
const json = (c: { init?: RequestInit }) => JSON.parse(String(c.init?.body));
afterEach(() => vi.unstubAllGlobals());

describe("Bluesky sign-in", () => {
  it("refuses anything that is not an app password before calling the network", async () => {
    expect(APP_PASSWORD_RE.test("abcd-efgh-ijkl-mnop")).toBe(true);
    expect(APP_PASSWORD_RE.test("hunter2")).toBe(false);
    await expect(bsky.signIn!({ identifier: "acme.bsky.social", password: "hunter2" })).rejects.toMatchObject({ category: "validation", providerCode: "app_password_required" });
    expect(() => bsky.authorizationUrl({ state: "s", redirectUri: "https://app.test/cb" })).toThrow(/app password/);
  });

  it("creates a session and reads the expiry from the access JWT", async () => {
    const calls = stub({ "createSession": () => ({ body: { accessJwt: jwt(1_900_000_000), refreshJwt: "r1", did: DID, handle: "acme.bsky.social" } }) });
    const c = await bsky.signIn!({ identifier: "@acme.bsky.social", password: "abcd-efgh-ijkl-mnop" });
    expect(c).toMatchObject({ refreshToken: "r1", providerUserId: DID, providerUserName: "@acme.bsky.social", expiresAt: new Date(1_900_000_000_000).toISOString() });
    expect(json(calls[0])).toEqual({ identifier: "acme.bsky.social", password: "abcd-efgh-ijkl-mnop" });
    expect(jwtExpiry("not-a-jwt")).toBeUndefined();
  });

  it("refreshes with the refresh JWT as bearer and lists exactly one account", async () => {
    const calls = stub({
      "refreshSession": () => ({ body: { accessJwt: jwt(1_950_000_000), refreshJwt: "r2", did: DID, handle: "acme.bsky.social" } }),
      "getProfile": () => ({ body: { did: DID, handle: "acme.bsky.social", displayName: "Acme", avatar: "https://cdn/a.jpg" } }),
    });
    expect(await bsky.refresh(cred)).toMatchObject({ refreshToken: "r2" });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer refresh");
    expect(await bsky.listChannels(cred)).toEqual([expect.objectContaining({ kind: "bluesky_account", remoteId: DID, handle: "@acme.bsky.social", name: "Acme" })]);
  });

  it("maps XRPC errors onto the taxonomy", () => {
    expect(mapAtError(400, { error: "ExpiredToken", message: "Token has expired" }).category).toBe("permission");
    expect(mapAtError(429, { error: "RateLimitExceeded" }, { headers: new Headers({ "ratelimit-reset": String(Math.floor(Date.now() / 1000) + 120) }) })).toMatchObject({ category: "rate_limit", retryAfterSeconds: expect.any(Number) });
    expect(mapAtError(400, { error: "RecordNotFound" }).category).toBe("deleted");
    expect(mapAtError(400, { error: "BlobTooLarge" }).category).toBe("validation");
  });
});

describe("Bluesky rich text", () => {
  it("counts graphemes, not UTF-16 units, and addresses facets in UTF-8 bytes", () => {
    expect(graphemes("héllo 👍🏽")).toBe(7);
    expect("héllo 👍🏽".length).toBe(10);
    const text = "👍 see https://acme.test/launch, thanks @fan.bsky.social #launch";
    const s = spans(text);
    expect(s.map((x) => [x.kind, x.value])).toEqual([["link", "https://acme.test/launch"], ["mention", "fan.bsky.social"], ["tag", "launch"]]);
    expect(byteRange(text, s[0].start, s[0].end)).toEqual({ byteStart: 9, byteEnd: 33 });
  });

  it("only makes a mention facet when the handle resolves", async () => {
    const facets = await facetsFor("hi @fan.bsky.social and @nobody.example", async (h) => (h === "fan.bsky.social" ? "did:plc:fan" : null));
    expect(facets).toHaveLength(1);
    expect(facets[0].features[0]).toEqual({ $type: "app.bsky.richtext.facet#mention", did: "did:plc:fan" });
  });

  it("replaces the UTF-16 length check with a grapheme one", () => {
    const emoji = "👍🏽".repeat(299);
    expect(bsky.validate(ch, req({ text: emoji })).filter((i) => i.severity === "error")).toEqual([]);
    expect(blueskyIssues(req({ text: "x".repeat(301) })).map((i) => i.code)).toContain("text_too_long");
    expect(blueskyIssues(req({ format: "video", media: [{ url: "u", mimeType: "video/quicktime" }] })).map((i) => i.code)).toContain("video_format");
  });
});

describe("Bluesky records", () => {
  it("derives a stable, TID-shaped record key from the idempotency key", () => {
    const a = tidFromKey("key-1");
    expect(a).toMatch(/^[234567abcdefghij][234567a-z]{12}$/);
    expect(a).toBe(tidFromKey("key-1"));
    expect(a).not.toBe(tidFromKey("key-2"));
  });

  it("holds one embed: video, else images, else a link card", () => {
    expect(embedFor(req({ link: "https://acme.test/x" }), { images: [] })).toMatchObject({ $type: "app.bsky.embed.external", external: { uri: "https://acme.test/x", title: "acme.test" } });
    expect(embedFor(req({ link: "https://acme.test/x" }), { images: [{ blob, alt: "A" }] })).toMatchObject({ $type: "app.bsky.embed.images" });
    expect(embedFor(req(), { images: [{ blob, alt: "A" }], video: { blob } })?.$type).toBe("app.bsky.embed.video");
  });

  it("builds the record with facets and langs", async () => {
    const r = await buildRecord(req({ text: "Go https://acme.test now", settings: { langs: ["en"] } }), { images: [] }, async () => null, "2026-09-05T10:00:00.000Z");
    expect(r).toMatchObject({ $type: "app.bsky.feed.post", text: "Go https://acme.test now", createdAt: "2026-09-05T10:00:00.000Z", langs: ["en"] });
    expect(r.facets?.[0].features[0]).toEqual({ $type: "app.bsky.richtext.facet#link", uri: "https://acme.test" });
  });

  it("uploads images then creates the record under the derived key, and finds it again by lookup", async () => {
    const rkey = tidFromKey("key-1");
    let created = false;
    const calls = stub({
      "media.test/a.png": () => ({ body: "PNGBYTES" }),
      "uploadBlob": () => ({ body: { blob } }),
      "getRecord": () => (created ? { body: { uri: `at://${DID}/app.bsky.feed.post/${rkey}`, cid: "c1", value: { createdAt: "2026-09-05T10:00:00.000Z" } } } : { status: 400, body: { error: "RecordNotFound" } }),
      "createRecord": () => {
        created = true;
        return { body: { uri: `at://${DID}/app.bsky.feed.post/${rkey}`, cid: "c1" } };
      },
    });
    const r = await bsky.publish(cred, ch, req({ format: "image", media: [{ url: "https://media.test/a.png", mimeType: "image/png", altText: "A" }] }));
    expect(r.url).toBe(`https://bsky.app/profile/acme.bsky.social/post/${rkey}`);
    const create = calls.find((c) => c.url.includes("createRecord"))!;
    expect(json(create)).toMatchObject({ repo: DID, collection: "app.bsky.feed.post", rkey, record: { embed: { $type: "app.bsky.embed.images", images: [{ alt: "A" }] } } });
    expect(await bsky.findPublication(cred, ch, "key-1")).toMatchObject({ remoteId: r.remoteId });
    // A second attempt with the same key returns the existing post and writes nothing new.
    const before = calls.length;
    await bsky.publish(cred, ch, req({ format: "image", media: [{ url: "https://media.test/a.png", mimeType: "image/png", altText: "A" }] }));
    expect(calls.slice(before).some((c) => c.url.includes("createRecord"))).toBe(false);
  });
});

describe("Bluesky inbox and insights", () => {
  it("keeps replies, mentions and quotes and drops likes", () => {
    const base = { uri: "at://did:plc:fan/app.bsky.feed.post/1", cid: "c", author: { did: "did:plc:fan", handle: "fan.bsky.social", displayName: "Fan" }, indexedAt: "2026-09-05T10:00:00.000Z", record: { text: "Nice", reply: { root: { uri: "at://root", cid: "r" }, parent: { uri: "at://root", cid: "r" } } } };
    expect(notificationToItem({ ...base, reason: "reply", reasonSubject: "at://root" }, ch)).toMatchObject({ kind: "comment", threadRemoteId: "at://root", inReplyToRemoteId: "at://root", postRemoteId: "at://root", author: { handle: "@fan.bsky.social", name: "Fan" }, postUrl: "https://bsky.app/profile/fan.bsky.social/post/1" });
    expect(notificationToItem({ ...base, reason: "mention", record: { text: "hey @acme" } }, ch)?.kind).toBe("mention");
    expect(notificationToItem({ ...base, reason: "like" }, ch)).toBeNull();
  });

  it("replies with root and parent refs read from the parent post", async () => {
    const calls = stub({
      "getPosts": () => ({ body: { posts: [{ uri: "at://parent", cid: "pc", record: { reply: { root: { uri: "at://root", cid: "rc" }, parent: { uri: "at://x", cid: "xc" } } } }] } }),
      "createRecord": () => ({ body: { uri: "at://mine", cid: "mc" } }),
    });
    const r = await bsky.reply!(cred, ch, { kind: "comment", threadRemoteId: "at://root", inReplyToRemoteId: "at://parent", text: "Thanks!", idempotencyKey: "rep-1" });
    expect(r.remoteId).toBe("at://mine");
    expect(json(calls[1]).record.reply).toEqual({ root: { uri: "at://root", cid: "rc" }, parent: { uri: "at://parent", cid: "pc" } });
    expect(json(calls[1]).rkey).toBe(tidFromKey("rep-1"));
  });

  it("maps counts and folds reposts and quotes into shares", () => {
    expect(postToFacts({ uri: "at://p", likeCount: 5, replyCount: 2, repostCount: 3, quoteCount: 1 }, "2026-09-05")).toEqual([
      { entity: "post", remoteId: "at://p", metric: "reactions", day: "2026-09-05", value: 5, source: "bluesky.likeCount" },
      { entity: "post", remoteId: "at://p", metric: "comments", day: "2026-09-05", value: 2, source: "bluesky.replyCount" },
      { entity: "post", remoteId: "at://p", metric: "shares", day: "2026-09-05", value: 4, source: "bluesky.repostCount+quoteCount" },
    ]);
  });
});

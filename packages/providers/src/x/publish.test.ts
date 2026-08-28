import { afterEach, describe, expect, it, vi } from "vitest";
import { createXProvider } from "./index";
import { capsFor, mapXError, rateLimitReset } from "./client";
import { tweetBody } from "./publish";
import { categoryFor } from "./media";
import type { ChannelDescriptor, Credential, PublishRequest } from "../types";

const cfg = { clientId: "id", clientSecret: "secret" };
const x = createXProvider(cfg);
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"];
const cred: Credential = { accessToken: "tok", scopes: SCOPES, providerUserId: "u1" };
const ch: ChannelDescriptor = { remoteId: "u1", kind: "x_account", network: "x", name: "Acme", handle: "@acme", capabilities: capsFor(cred) };
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ idempotencyKey: "abcdef12-key", format: "text", text: "Shipping today.", media: [], ...over });

function stub(routes: Record<string, () => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { title: "Not Found Error", detail: "not found" } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

/* Bodies follow both v2 problem objects and the legacy {errors:[{code}]} envelope. */
describe("mapXError", () => {
  it("maps expired tokens and unauthorised clients to permission", () => {
    expect(mapXError(401, { title: "Unauthorized", detail: "Unauthorized", status: 401 }).category).toBe("permission");
    expect(mapXError(403, { errors: [{ code: 89, message: "Invalid or expired token" }] })).toMatchObject({ category: "permission", providerCode: "89" });
  });

  it("maps duplicate content to a non-retryable policy error", () => {
    const dup = mapXError(403, { detail: "You are not allowed to create a Tweet with duplicate content." });
    expect(dup).toMatchObject({ category: "policy", retryable: false });
    expect(mapXError(403, { errors: [{ code: 187, message: "Status is a duplicate." }] }).category).toBe("policy");
  });

  it("maps 429 with x-rate-limit-reset, not Retry-After", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const e = mapXError(429, { title: "Too Many Requests" }, { headers: new Headers({ "x-rate-limit-reset": String(nowSec + 300) }) });
    expect(e.category).toBe("rate_limit");
    expect(e.retryAfterSeconds).toBeGreaterThanOrEqual(298);
    expect(e.retryAfterSeconds).toBeLessThanOrEqual(301);
    expect(rateLimitReset(new Headers({}))).toBe(900);
  });

  it("maps missing posts to deleted and mutating 5xx to ambiguous temporary", () => {
    expect(mapXError(404, { title: "Not Found Error", detail: "Could not find tweet" }).category).toBe("deleted");
    expect(mapXError(503, null, { ambiguous: true })).toMatchObject({ category: "temporary", ambiguous: true, retryable: true });
  });
});

describe("X publish request shaping", () => {
  it("sends text alone, then media ids and reply settings when given", () => {
    expect(tweetBody("hi", [], {})).toEqual({ text: "hi" });
    expect(tweetBody("hi", ["m1", "m2"], { replySettings: "following" })).toEqual({ text: "hi", media: { media_ids: ["m1", "m2"] }, reply_settings: "following" });
    expect(tweetBody("hi", [], {}, "t1")).toMatchObject({ reply: { in_reply_to_tweet_id: "t1" } });
  });

  it("publishes a text post and returns the canonical status URL", async () => {
    const calls = stub({ "/2/tweets": () => ({ body: { data: { id: "t1", text: "Shipping today.", created_at: "2026-08-28T09:00:00Z" } } }) });
    const r = await x.publish(cred, ch, req());
    expect(r).toMatchObject({ remoteId: "t1", url: "https://x.com/acme/status/t1", publishedAt: "2026-08-28T09:00:00Z" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: "Shipping today." });
  });

  it("chains a thread onto the first post and keeps the root as the remote id", async () => {
    let n = 0;
    const calls = stub({ "/2/tweets": () => ({ body: { data: { id: `t${++n}` } } }) });
    const r = await x.publish(cred, ch, req({ settings: { thread: ["Part two.", "Part three."] } }));
    expect(r.remoteId).toBe("t1");
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ text: "Part two.", reply: { in_reply_to_tweet_id: "t1" } });
    expect(JSON.parse(String(calls[2].init?.body))).toMatchObject({ text: "Part three.", reply: { in_reply_to_tweet_id: "t2" } });
  });

  it("marks a broken thread continuation ambiguous — the root post already exists", async () => {
    let n = 0;
    stub({ "/2/tweets": () => (++n === 1 ? { body: { data: { id: "t1" } } } : { status: 500, body: { title: "Internal Error" } }) });
    await expect(x.publish(cred, ch, req({ settings: { thread: ["Part two."] } }))).rejects.toMatchObject({ category: "temporary", ambiguous: true });
  });

  it("uploads media through the v1.1 chunked flow with the right media_category", async () => {
    expect(categoryFor("video/mp4")).toBe("tweet_video");
    expect(categoryFor("image/gif")).toBe("tweet_gif");
    expect(categoryFor("image/png")).toBe("tweet_image");
    const calls = stub({
      "media.test/a.png": () => ({ body: {} }),
      "media/upload.json": () => ({ body: { media_id_string: "m1" } }),
      "media/metadata/create.json": () => ({ body: {} }),
      "/2/tweets": () => ({ body: { data: { id: "t5" } } }),
    });
    await x.publish(cred, ch, req({ format: "image", media: [{ url: "https://media.test/a.png", mimeType: "image/png", altText: "A chart" }] }));
    // INIT/FINALIZE are form-encoded, APPEND is multipart; both expose .get().
    const commands = calls.filter((c) => c.url.includes("media/upload.json")).map((c) => String((c.init?.body as URLSearchParams | FormData).get("command")));
    expect(commands).toEqual(["INIT", "APPEND", "FINALIZE"]);
    expect(calls.some((c) => c.url.includes("media/metadata/create.json"))).toBe(true);
    expect(JSON.parse(String(calls.at(-1)!.init?.body))).toMatchObject({ media: { media_ids: ["m1"] } });
  });
});

describe("X publish validation", () => {
  const codes = (r: PublishRequest) => x.validate(ch, r).filter((i) => i.severity === "error").map((i) => i.code);

  it("enforces 280 characters on every post in the thread", () => {
    expect(codes(req({ text: "x".repeat(281) }))).toContain("text_too_long");
    expect(codes(req({ settings: { thread: ["x".repeat(281)] } }))).toContain("thread_part_too_long");
  });

  it("refuses mixed media and more than one video", () => {
    const video = { url: "https://media.test/v.mp4", mimeType: "video/mp4" };
    const image = { url: "https://media.test/a.png", mimeType: "image/png" };
    expect(codes(req({ format: "video", media: [video, image] }))).toContain("mixed_media");
    expect(codes(req({ format: "video", media: [video, { ...video, url: "https://media.test/v2.mp4" }] }))).toContain("too_many_videos");
  });
});

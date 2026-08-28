import { afterEach, describe, expect, it, vi } from "vitest";
import { createTikTokProvider } from "./index";
import { capsFor } from "./client";
import type { ChannelDescriptor, Credential } from "../types";

const cfg = { clientId: "key", clientSecret: "secret" };
const tiktok = createTikTokProvider(cfg);
const full: Credential = { accessToken: "tok", scopes: ["user.info.basic", "video.publish", "video.list", "comment.list", "comment.list.manage", "video.insights"], providerUserId: "open-1" };
const basic: Credential = { ...full, scopes: ["user.info.basic", "video.publish", "video.list"] };
const chFor = (c: Credential): ChannelDescriptor => ({ remoteId: "open-1", kind: "tiktok_account", network: "tiktok", name: "Brand", handle: "@brand", capabilities: capsFor(c) });

/* Shapes from the Display API (video/list) and Business Account API (business/comment/*) references. */
function stub(routes: Record<string, (init?: RequestInit, url?: string) => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key](init, url) : { status: 404, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const VIDEOS = { data: { videos: [{ id: "v1", share_url: "https://www.tiktok.com/@brand/video/v1", create_time: 1700000000 }] }, error: { code: "ok", message: "" } };
const COMMENTS = { code: 0, message: "OK", data: { comments: [
  { comment_id: "c1", video_id: "v1", text: "Love it", create_time: 1700000100, user_id: "u1", username: "ada", display_name: "Ada", owner: false, replies: 1 },
] } };
const REPLIES = { code: 0, message: "OK", data: { comments: [{ comment_id: "c2", video_id: "v1", text: "Thanks Ada", create_time: 1700000200, owner: true, parent_comment_id: "c1" }] } };

describe("TikTok capabilities derive from granted scopes", () => {
  it("turns comments/reply/audience off without Business Account scopes and explains why", () => {
    const caps = capsFor(basic);
    expect(caps.inbox).toMatchObject({ comments: false, reply: false, messages: false, mentions: false });
    expect(caps.insights.audience).toBe(false);
    expect(caps.reasons?.comments).toMatch(/comment\.list/);
    expect(caps.reasons?.messages).toBeTruthy();
    expect(capsFor(full).inbox).toMatchObject({ comments: true, reply: true });
  });
});

describe("TikTok inbox", () => {
  it("returns nothing when comments are not granted, without calling the API", async () => {
    const calls = stub({});
    expect((await tiktok.fetchInbox!(basic, chFor(basic), {})).items).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("maps comments and replies from the Business API under the root comment", async () => {
    stub({ "/video/list/": () => ({ body: VIDEOS }), "/business/comment/list/": () => ({ body: COMMENTS }), "/business/comment/reply/list/": () => ({ body: REPLIES }) });
    const page = await tiktok.fetchInbox!(full, chFor(full), {});
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ remoteId: "c1", threadRemoteId: "c1", direction: "inbound", author: { handle: "@ada" }, postRemoteId: "v1", postUrl: "https://www.tiktok.com/@brand/video/v1" });
    expect(page.items[1]).toMatchObject({ remoteId: "c2", threadRemoteId: "c1", inReplyToRemoteId: "c1", direction: "outbound", author: { name: "Brand" } });
  });

  it("replies via comment/reply/create with the post id, resolving it from the thread when absent", async () => {
    const calls = stub({ "/video/list/": () => ({ body: VIDEOS }), "/business/comment/list/": () => ({ body: COMMENTS }), "/business/comment/reply/create/": () => ({ body: { code: 0, message: "OK", data: { comment_id: "c9" } } }) });
    const r = await tiktok.reply!(full, chFor(full), { kind: "comment", threadRemoteId: "c1", text: "hi", idempotencyKey: "k", postRemoteId: "v1" });
    expect(r.remoteId).toBe("c9");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ business_id: "open-1", video_id: "v1", comment_id: "c1", text: "hi" });
    const r2 = await tiktok.reply!(full, chFor(full), { kind: "comment", threadRemoteId: "c1", text: "hi", idempotencyKey: "k2" });
    expect(r2.remoteId).toBe("c9");
    await expect(tiktok.reply!(basic, chFor(basic), { kind: "comment", threadRemoteId: "c1", text: "hi", idempotencyKey: "k3" })).rejects.toMatchObject({ category: "permission" });
  });

  it("maps Business API auth failures to permission and reconciles ambiguous replies by marker", async () => {
    stub({ "/video/list/": () => ({ body: VIDEOS }), "/business/comment/list/": () => ({ body: { code: 40100, message: "Access token expired" } }) });
    await expect(tiktok.fetchInbox!(full, chFor(full), {})).rejects.toMatchObject({ category: "permission", providerCode: "40100" });
    const fresh = Math.floor(Date.now() / 1000) - 30;
    stub({ "/video/list/": () => ({ body: VIDEOS }), "/business/comment/list/": () => ({ body: { code: 0, data: { comments: [{ comment_id: "c5", text: "ref deadbeef", create_time: fresh, owner: true }] } } }) });
    expect(await tiktok.findReply!(full, chFor(full), "deadbeef-key")).toMatchObject({ remoteId: "c5" });
    expect(await tiktok.findReply!(full, chFor(full), "nomatch1")).toBeNull();
  });

  it("healthCheck probes user info and lists missing scopes", async () => {
    stub({ "/user/info/": () => ({ body: { data: { user: { open_id: "open-1" } }, error: { code: "ok" } } }) });
    expect(await tiktok.healthCheck!({ ...basic, scopes: ["user.info.basic"] }, chFor(basic))).toMatchObject({ tokenOk: true, permissionsOk: false, missingScopes: ["video.publish"] });
    stub({ "/user/info/": () => ({ status: 401, body: { error: { code: "access_token_invalid", message: "bad" } } }) });
    expect(await tiktok.healthCheck!(full, chFor(full))).toMatchObject({ tokenOk: false });
  });
});

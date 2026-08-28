import { afterEach, describe, expect, it, vi } from "vitest";
import { createLinkedInProvider } from "./index";
import type { ChannelDescriptor, Credential } from "../types";
import { ORG_CAPS } from "./client";

const cfg = { clientId: "id", clientSecret: "secret" };
const li = createLinkedInProvider(cfg);
const cred: Credential = { accessToken: "tok", scopes: ["r_organization_social", "w_organization_social", "rw_organization_admin"], providerUserId: "me" };
const org = "urn:li:organization:123";
const ch: ChannelDescriptor = { remoteId: org, kind: "linkedin_organization", network: "linkedin", name: "Acme", capabilities: ORG_CAPS() };
const POST = "urn:li:share:7001";
const ROOT = `urn:li:comment:(${POST},9001)`;

/* Response shapes from the Posts API and Social Actions (comments) API references. */
function stub(routes: Record<string, (init?: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key](init) : { status: 404, body: { message: "not found" } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("LinkedIn inbox", () => {
  it("maps comments on recent Page posts, threading replies under the root comment", async () => {
    stub({
      "/rest/posts?q=author": () => ({ body: { elements: [{ id: POST, createdAt: 1700000000000 }] } }),
      "/rest/socialActions/urn%3Ali%3Ashare%3A7001/comments": () => ({ body: { elements: [
        { $URN: ROOT, actor: "urn:li:person:abc", object: POST, message: { text: "Great post" }, created: { time: 1700000100000 } },
        { $URN: `urn:li:comment:(${POST},9002)`, actor: org, object: POST, parentComment: ROOT, message: { text: "Thanks!" }, created: { time: 1700000200000 } },
      ] } }),
      "organizationalEntityNotifications": () => ({ body: { elements: [{ action: "SHARE_MENTION", generatedActivity: "urn:li:share:8000", lastModifiedAt: 1700000300000, actor: "urn:li:person:zzz" }] } }),
    });
    const page = await li.fetchInbox!(cred, ch, {});
    expect(page.items.map((i) => i.kind)).toEqual(["comment", "comment", "mention"]);
    expect(page.items[0]).toMatchObject({ remoteId: ROOT, threadRemoteId: ROOT, direction: "inbound", postRemoteId: POST, text: "Great post" });
    expect(page.items[1]).toMatchObject({ threadRemoteId: ROOT, inReplyToRemoteId: ROOT, direction: "outbound", author: { remoteId: org, name: "Acme" } });
    expect(page.items[2]).toMatchObject({ kind: "mention", postRemoteId: "urn:li:share:8000" });
    const since = await li.fetchInbox!(cred, ch, { since: "2023-11-14T22:15:00.000Z" });
    expect(since.items.map((i) => i.kind)).toEqual(["comment", "mention"]);
  });

  it("replies through the Social Actions API against the post derived from the comment URN", async () => {
    const calls = stub({ "/rest/socialActions/urn%3Ali%3Ashare%3A7001/comments": () => ({ status: 201, body: {}, headers: { "x-restli-id": `urn:li:comment:(${POST},9100)` } }) });
    const r = await li.reply!(cred, ch, { kind: "comment", threadRemoteId: ROOT, text: "Appreciated", idempotencyKey: "k" });
    expect(r.remoteId).toBe(`urn:li:comment:(${POST},9100)`);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ actor: org, object: POST, parentComment: ROOT, message: { text: "Appreciated" } });
    await expect(li.reply!(cred, ch, { kind: "message", threadRemoteId: "x", text: "dm", idempotencyKey: "k" })).rejects.toMatchObject({ category: "permission" });
  });

  it("reconciles an ambiguous reply structurally — same author, thread, text and after the attempt", async () => {
    const sentAfter = new Date(Date.now() - 120_000).toISOString();
    const lookup = { kind: "comment" as const, threadRemoteId: ROOT, text: "Appreciated", idempotencyKey: "k", sentAfter };
    stub({
      "/comments": () => ({ body: { elements: [
        { $URN: `urn:li:comment:(${POST},9200)`, actor: org, parentComment: ROOT, message: { text: "Appreciated" }, created: { time: Date.now() - 60_000 } },
      ] } }),
    });
    expect(await li.findReply!(cred, ch, lookup)).toMatchObject({ remoteId: `urn:li:comment:(${POST},9200)` });
    // Same text but sent before this attempt, by someone else, or on another thread: not ours.
    expect(await li.findReply!(cred, ch, { ...lookup, sentAfter: new Date().toISOString() })).toBeNull();
    expect(await li.findReply!(cred, ch, { ...lookup, text: "Something else" })).toBeNull();
    stub({ "/comments": () => ({ body: { elements: [{ $URN: `urn:li:comment:(${POST},9300)`, actor: "urn:li:person:abc", parentComment: ROOT, message: { text: "Appreciated" }, created: { time: Date.now() - 60_000 } }] } }) });
    expect(await li.findReply!(cred, ch, lookup)).toBeNull();
  });

  it("surfaces a 429 with Retry-After as a retryable rate_limit", async () => {
    stub({ "/rest/posts?q=author": () => ({ status: 429, body: { message: "Throttled" }, headers: { "retry-after": "60" } }) });
    await expect(li.fetchInbox!(cred, ch, {})).rejects.toMatchObject({ category: "rate_limit", retryAfterSeconds: 60, retryable: true });
  });

  it("reports missing scopes and dead tokens via healthCheck", async () => {
    stub({ "/rest/organizations/123": () => ({ body: { localizedName: "Acme" } }) });
    expect(await li.healthCheck!({ ...cred, scopes: ["r_organization_social"] }, ch)).toMatchObject({ tokenOk: true, permissionsOk: false, missingScopes: ["w_organization_social"] });
    stub({ "/rest/organizations/123": () => ({ status: 401, body: { message: "expired", serviceErrorCode: 65601 } }) });
    expect(await li.healthCheck!(cred, ch)).toMatchObject({ tokenOk: false });
  });
});

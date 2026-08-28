import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaProvider } from "./index";
import { FB_CAPS, IG_CAPS } from "./graph";
import type { ChannelDescriptor, Credential } from "../types";

const cfg = { clientId: "app", clientSecret: "shh" };
const meta = createMetaProvider(cfg);
const cred: Credential = { accessToken: "tok", scopes: ["pages_manage_engagement"], providerUserId: "me" };
const page: ChannelDescriptor = { remoteId: "page1", kind: "facebook_page", network: "facebook", name: "Acme", capabilities: FB_CAPS() };
const ig: ChannelDescriptor = { remoteId: "ig1", kind: "instagram_business", network: "instagram", name: "Acme", handle: "@acme", capabilities: IG_CAPS() };

/* Response shapes follow the Graph API comment/replies edge reference. */
function stub(routes: Record<string, () => unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    return new Response(JSON.stringify(key ? routes[key]() : { error: { message: "not found", code: 100 } }), { status: key ? 200 : 404, headers: { "content-type": "application/json" } });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Meta comment reconciliation", () => {
  const sentAfter = new Date(Date.now() - 120_000).toISOString();
  const fresh = new Date(Date.now() - 60_000).toISOString();
  const lookup = { kind: "comment" as const, threadRemoteId: "post1_c1", text: "Thanks for reading!", idempotencyKey: "k1", sentAfter };

  it("finds our own reply on the thread — no marker in the text", async () => {
    const calls = stub({
      "/post1_c1/comments": () => ({ data: [
        { id: "post1_c9", message: "Thanks for reading!", created_time: fresh, from: { id: "page1", name: "Acme" } },
      ] }),
    });
    expect(await meta.findReply!(cred, page, lookup)).toMatchObject({ remoteId: "post1_c9", sentAt: fresh });
    expect(calls[0]).toContain("/post1_c1/comments");
  });

  it("ignores a matching text from someone else, a different text, or one older than the attempt", async () => {
    stub({ "/post1_c1/comments": () => ({ data: [{ id: "post1_c8", message: "Thanks for reading!", created_time: fresh, from: { id: "u9", name: "Ada" } }] }) });
    expect(await meta.findReply!(cred, page, lookup)).toBeNull();
    stub({ "/post1_c1/comments": () => ({ data: [{ id: "post1_c7", message: "Different", created_time: fresh, from: { id: "page1" } }] }) });
    expect(await meta.findReply!(cred, page, lookup)).toBeNull();
    const old = new Date(Date.now() - 600_000).toISOString();
    stub({ "/post1_c1/comments": () => ({ data: [{ id: "post1_c6", message: "Thanks for reading!", created_time: old, from: { id: "page1" } }] }) });
    expect(await meta.findReply!(cred, page, lookup)).toBeNull();
  });

  it("reads the replies edge for Instagram and matches on our username", async () => {
    const calls = stub({ "/c100/replies": () => ({ data: [{ id: "c101", text: "Thanks for reading!", timestamp: fresh, username: "acme" }] }) });
    expect(await meta.findReply!(cred, ig, { ...lookup, threadRemoteId: "c100" })).toMatchObject({ remoteId: "c101" });
    expect(calls[0]).toContain("/c100/replies");
  });

  it("targets the comment we replied to when the thread has a deeper parent", async () => {
    const calls = stub({ "/post1_c5/comments": () => ({ data: [] }) });
    expect(await meta.findReply!(cred, page, { ...lookup, inReplyToRemoteId: "post1_c5" })).toBeNull();
    expect(calls[0]).toContain("/post1_c5/comments");
  });

  it("still reconciles DMs through the conversations echo, not the comment edge", async () => {
    const calls = stub({ "/page1/conversations": () => ({ data: [{ id: "t1", messages: { data: [{ id: "m.abcd1234x", created_time: fresh, from: { id: "page1" } }] } }] }) });
    expect(await meta.findReply!(cred, page, { ...lookup, kind: "message", idempotencyKey: "abcd1234-rest" })).toMatchObject({ remoteId: "m.abcd1234x" });
    expect(calls[0]).toContain("/page1/conversations");
  });
});

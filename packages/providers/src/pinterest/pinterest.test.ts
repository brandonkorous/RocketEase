import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinterestProvider } from "./index";
import { accountCaps, boardCaps, mapPinterestError } from "./client";
import { pinBody, titleFor } from "./publish";
import { analyticsToFacts } from "./insights";
import { INBOX } from "./inbox";
import type { ChannelDescriptor, Credential, PublishRequest } from "../types";

const pinterest = createPinterestProvider({ clientId: "id", clientSecret: "secret" });
const SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];
const cred: Credential = { accessToken: "tok", scopes: SCOPES, providerUserId: "acct-1" };
const board: ChannelDescriptor = { remoteId: "board-1", kind: "pinterest_board", network: "pinterest", name: "Recipes", capabilities: boardCaps(cred) };
const acct: ChannelDescriptor = { remoteId: "acct-1", kind: "pinterest_account", network: "pinterest", name: "Acme", capabilities: accountCaps(cred) };

const IMAGE = { url: "https://media.test/a.jpg", mimeType: "image/jpeg", altText: "A bowl of soup" };
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ idempotencyKey: "abcdef12-key", format: "image", text: "Winter soup\nSlow simmered.", media: [IMAGE], link: "https://acme.test/soup", ...over });

function stub(routes: Record<string, () => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { code: 404, message: "not found" } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

/* Pinterest v5 error bodies are { code, message } beside a meaningful HTTP status. */
describe("mapPinterestError", () => {
  it("maps auth, validation, missing and server statuses", () => {
    expect(mapPinterestError(401, { code: 2, message: "Authentication failed" })).toMatchObject({ category: "permission", providerCode: "2", retryable: false });
    expect(mapPinterestError(403, { code: 3, message: "Permission denied" }).category).toBe("permission");
    expect(mapPinterestError(400, { code: 7, message: "Invalid parameters" }).category).toBe("validation");
    expect(mapPinterestError(404, { code: 404, message: "Pin not found" }).category).toBe("deleted");
    expect(mapPinterestError(500, null, { ambiguous: true })).toMatchObject({ category: "temporary", ambiguous: true, retryable: true });
  });

  it("reads the seconds-remaining X-RateLimit-Reset header rather than Retry-After", () => {
    const e = mapPinterestError(429, { code: 8, message: "Rate limited" }, { headers: new Headers({ "x-ratelimit-reset": "45" }) });
    expect(e).toMatchObject({ category: "rate_limit", retryable: true, retryAfterSeconds: 45 });
    expect(mapPinterestError(429, null).retryAfterSeconds).toBe(60);
  });
});

describe("Pinterest pin shaping", () => {
  it("splits the title off the first line and carries alt text, link and description", () => {
    expect(titleFor(req())).toBe("Winter soup");
    const body = pinBody(req(), "board-1", { source_type: "image_url", url: IMAGE.url });
    expect(body).toMatchObject({ board_id: "board-1", title: "Winter soup", description: "Winter soup\nSlow simmered.", alt_text: "A bowl of soup", link: "https://acme.test/soup" });
    expect(body.media_source).toEqual({ source_type: "image_url", url: IMAGE.url });
  });

  it("creates the pin on the selected board", async () => {
    const calls = stub({ "/v5/pins": () => ({ body: { id: "pin-1", created_at: "2026-08-28T09:00:00Z" } }) });
    const r = await pinterest.publish(cred, board, req());
    expect(r).toMatchObject({ remoteId: "pin-1", url: "https://www.pinterest.com/pin/pin-1/", publishedAt: "2026-08-28T09:00:00Z" });
    expect(JSON.parse(String(calls[0].init?.body)).board_id).toBe("board-1");
  });

  it("refuses a pin on the account channel, a carousel under two images and a video with no cover", () => {
    const codes = (ch: ChannelDescriptor, r: PublishRequest) => pinterest.validate(ch, r).filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes(acct, req())).toContain("board_required");
    expect(codes(board, req({ format: "carousel", media: [IMAGE] }))).toContain("carousel_too_small");
    expect(codes(board, req({ format: "video", media: [{ url: "https://media.test/v.mp4", mimeType: "video/mp4" }] }))).toContain("cover_image_required");
    expect(codes(board, req())).toEqual([]);
  });

  it("finds an ambiguous pin by the key marker on the board", async () => {
    stub({ "/boards/board-1/pins": () => ({ body: { items: [{ id: "pin-7", description: "ref abcdef12", created_at: "2026-08-28T08:00:00Z" }] } }) });
    expect(await pinterest.findPublication!(cred, board, "abcdef12-key")).toMatchObject({ remoteId: "pin-7" });
    expect(await pinterest.findPublication!(cred, board, "zzzzzzzz-key")).toBeNull();
  });
});

/* Shape from the v5 user_account/analytics and pins/{id}/analytics references. */
const ANALYTICS = {
  all: {
    summary_metrics: { IMPRESSION: 900 },
    daily_metrics: [
      { date: "2026-08-20", metrics: { IMPRESSION: 500, SAVE: 20, PIN_CLICK: 40, OUTBOUND_CLICK: 12, ENGAGEMENT: 72, FOLLOW: 3 } },
      { date: "2026-08-21", metrics: { IMPRESSION: 400, SAVE: 15, OUTBOUND_CLICK: -1 } },
    ],
  },
};

describe("Pinterest insights parsing", () => {
  it("maps the documented metric types and skips Pinterest's -1 no-data marker", () => {
    const facts = analyticsToFacts(ANALYTICS, "channel", undefined);
    expect(facts.filter((f) => f.day === "2026-08-20").map((f) => f.metric).sort()).toEqual(["engagement", "follower_gain", "impressions", "link_clicks", "saves"]);
    expect(facts).toContainEqual({ entity: "channel", remoteId: undefined, metric: "link_clicks", day: "2026-08-20", value: 12, source: "pinterest.OUTBOUND_CLICK" });
    // -1 means "not available yet", never a real value.
    expect(facts.some((f) => f.day === "2026-08-21" && f.metric === "link_clicks")).toBe(false);
    // PIN_CLICK is a component of ENGAGEMENT and has no canonical metric.
    expect(facts.some((f) => f.source.includes("PIN_CLICK"))).toBe(false);
  });

  it("keys pin analytics on the pin id whatever the response's app-type casing", () => {
    const facts = analyticsToFacts({ ALL: ANALYTICS.all }, "post", "pin-1");
    expect(facts[0]).toMatchObject({ entity: "post", remoteId: "pin-1", metric: "impressions" });
  });

  it("imports account series once on the account channel, never per board", async () => {
    stub({
      "/user_account/analytics": () => ({ body: ANALYTICS }),
      "/user_account": () => ({ body: { follower_count: 4210 } }),
      "/pins/pin-1/analytics": () => ({ body: ANALYTICS }),
    });
    const onBoard = await pinterest.fetchInsights!(cred, board, { since: "2026-08-20", until: "2026-08-21", postRemoteIds: ["pin-1"] });
    expect(onBoard.facts.every((f) => f.entity === "post")).toBe(true);

    const onAccount = await pinterest.fetchInsights!(cred, acct, { since: "2026-08-20", until: "2026-08-21" });
    expect(onAccount.facts.some((f) => f.entity === "channel" && f.metric === "impressions")).toBe(true);
    expect(onAccount.facts).toContainEqual({ entity: "channel", metric: "followers", day: "2026-08-21", value: 4210, source: "pinterest.user_account.follower_count" });
  });
});

describe("Pinterest has no inbox and no webhooks", () => {
  it("declares every inbox capability false with a reason and omits the methods", () => {
    expect(INBOX).toEqual({ comments: false, mentions: false, messages: false, reviews: false, reply: false });
    expect(board.capabilities.reasons?.comments).toMatch(/no endpoint to read comments/);
    expect(board.capabilities.reasons?.reply).toMatch(/cannot post comments/);
    expect(pinterest.fetchInbox).toBeUndefined();
    expect(pinterest.reply).toBeUndefined();
    expect(pinterest.findReply).toBeUndefined();
    expect(pinterest.verifyWebhook).toBeUndefined();
    expect(pinterest.parseWebhook).toBeUndefined();
    expect(board.capabilities.ingestion).toEqual({ webhooks: false, polling: true });
  });

  it("explains why a board carries no account-wide audience numbers", () => {
    expect(board.capabilities.insights).toEqual({ organic: true, audience: false });
    expect(board.capabilities.reasons?.audience).toMatch(/not per board/);
    expect(acct.capabilities.formats).toEqual([]);
    expect(acct.capabilities.reasons?.formats).toMatch(/published to a board/);
  });
});

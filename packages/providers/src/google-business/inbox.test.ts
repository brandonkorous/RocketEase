import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleBusinessProvider } from "./index";
import { capsFor } from "./client";
import { fetchInbox, findReply, ratingOf, reply, reviewsToItems, reviewToItems, type GbpReview } from "./inbox";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";

const gbp = createGoogleBusinessProvider({ clientId: "id", clientSecret: "secret" });
const cred: Credential = { accessToken: "tok", scopes: ["https://www.googleapis.com/auth/business.manage"], providerUserId: "accounts/1" };
const LOCATION = "accounts/1/locations/2";
const ch: ChannelDescriptor = { remoteId: LOCATION, kind: "gbp_location", network: "google_business", name: "Acme Coffee", capabilities: capsFor(cred) };

function stub(routes: Record<string, () => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { error: { code: 404, message: "not found", errors: [{ reason: "notFound" }] } } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

/* Shapes from the v4 accounts.locations.reviews reference. */
const REVIEWS: GbpReview[] = [
  {
    name: `${LOCATION}/reviews/r1`,
    reviewId: "r1",
    reviewer: { displayName: "Dana P.", profilePhotoUrl: "https://lh3.example/dana" },
    starRating: "FIVE",
    comment: "Best flat white in town.",
    createTime: "2026-08-20T10:00:00Z",
    updateTime: "2026-08-20T10:00:00Z",
    reviewReply: { comment: "Thanks Dana!", updateTime: "2026-08-20T12:00:00Z" },
  },
  {
    name: `${LOCATION}/reviews/r2`,
    reviewId: "r2",
    reviewer: { isAnonymous: true },
    starRating: "TWO",
    createTime: "2026-08-21T09:00:00Z",
    updateTime: "2026-08-21T09:00:00Z",
  },
  { name: `${LOCATION}/reviews/r3`, reviewId: "r3", reviewer: { displayName: "Sam" }, starRating: "STAR_RATING_UNSPECIFIED", comment: "ok", updateTime: "2026-08-22T09:00:00Z" },
];

describe("review mapping", () => {
  it("maps the star enum to 1-5 and never to 0", () => {
    expect([ratingOf("ONE"), ratingOf("THREE"), ratingOf("FIVE")]).toEqual([1, 3, 5]);
    expect(ratingOf("STAR_RATING_UNSPECIFIED")).toBeUndefined();
    expect(ratingOf(undefined)).toBeUndefined();
  });

  it("maps a review with an owner answer to an inbound item and an outbound reply", () => {
    const items = reviewToItems(REVIEWS[0], ch);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ remoteId: "r1", threadRemoteId: "r1", kind: "review", direction: "inbound", rating: 5, text: "Best flat white in town.", occurredAt: "2026-08-20T10:00:00Z" });
    expect(items[0].author).toMatchObject({ name: "Dana P.", avatarUrl: "https://lh3.example/dana" });
    expect(items[1]).toMatchObject({ remoteId: "r1:reply", threadRemoteId: "r1", direction: "outbound", inReplyToRemoteId: "r1", text: "Thanks Dana!", occurredAt: "2026-08-20T12:00:00Z" });
    expect(items[1].author.remoteId).toBe(LOCATION);
  });

  it("handles an anonymous, star-only review", () => {
    const [item] = reviewToItems(REVIEWS[1], ch);
    expect(item).toMatchObject({ remoteId: "r2", direction: "inbound", rating: 2, text: "" });
    expect(item.author).toMatchObject({ remoteId: "anonymous:r2", name: "A Google user" });
    expect(item.author.avatarUrl).toBeUndefined();
  });

  it("sorts oldest first and honours the since cursor", () => {
    const all = reviewsToItems(REVIEWS, ch);
    expect(all.map((i) => i.remoteId)).toEqual(["r1", "r1:reply", "r2", "r3"]);
    expect(reviewsToItems(REVIEWS, ch, "2026-08-20T12:00:00Z").map((i) => i.remoteId)).toEqual(["r2", "r3"]);
  });
});

describe("fetchInbox", () => {
  it("lists the reviews of a location newest first and returns the page token", async () => {
    const calls = stub({ "/reviews": () => ({ body: { reviews: REVIEWS, nextPageToken: "tok2" } }) });
    const page = await fetchInbox(cred, ch, { since: "2026-08-20T12:00:00Z" });
    expect(page.cursor).toBe("tok2");
    expect(page.items.map((i) => i.remoteId)).toEqual(["r2", "r3"]);
    expect(calls[0].url).toContain(`https://mybusiness.googleapis.com/v4/${LOCATION}/reviews`);
    expect(calls[0].url).toContain("orderBy=updateTime+desc");
  });

  it("returns nothing when the location is gone rather than failing the poll", async () => {
    stub({});
    await expect(fetchInbox(cred, ch, {})).resolves.toEqual({ items: [], cursor: undefined });
  });
});

describe("reply and reconciliation", () => {
  it("PUTs the reply and derives a stable remote id", async () => {
    const calls = stub({ "/reply": () => ({ body: { comment: "Thanks!", updateTime: "2026-08-23T08:00:00Z" } }) });
    const res = await reply(cred, ch, { kind: "review", threadRemoteId: "r1", text: "Thanks!", idempotencyKey: "k1" });
    expect(res).toEqual({ remoteId: "r1:reply", sentAt: "2026-08-23T08:00:00Z" });
    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].url).toBe(`https://mybusiness.googleapis.com/v4/${LOCATION}/reviews/r1/reply`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ comment: "Thanks!" });
  });

  it("rejects a non-review kind and an over-long reply before calling Google", async () => {
    const calls = stub({});
    await expect(reply(cred, ch, { kind: "comment", threadRemoteId: "r1", text: "hi", idempotencyKey: "k" })).rejects.toBeInstanceOf(ProviderError);
    await expect(reply(cred, ch, { kind: "review", threadRemoteId: "r1", text: "x".repeat(4097), idempotencyKey: "k" })).rejects.toThrow(/4096 bytes/);
    expect(calls).toHaveLength(0);
  });

  it("reconciles an ambiguous reply by reading the review back (ENG-003)", async () => {
    stub({ "/reviews/r1": () => ({ body: REVIEWS[0] }) });
    const lookup = { kind: "review" as const, threadRemoteId: "r1", text: "Thanks Dana!", idempotencyKey: "k1", sentAfter: "2026-08-20T11:00:00Z" };
    await expect(findReply(cred, ch, lookup)).resolves.toEqual({ remoteId: "r1:reply", sentAt: "2026-08-20T12:00:00Z" });
    await expect(findReply(cred, ch, { ...lookup, text: "Different text" })).resolves.toBeNull();
    await expect(findReply(cred, ch, { ...lookup, sentAfter: "2026-08-20T13:00:00Z" })).resolves.toBeNull();
  });
});

describe("adapter surface", () => {
  it("declares reviews-only capabilities with reasons", () => {
    const caps = capsFor(cred);
    expect(caps.inbox).toEqual({ comments: false, mentions: false, messages: false, reviews: true, reply: true });
    expect(caps.formats).toEqual([]);
    expect(caps.ingestion).toEqual({ webhooks: false, polling: true });
    expect(caps.reasons?.formats).toBeTruthy();
    expect(caps.reasons?.webhooks).toBeTruthy();
  });

  it("refuses to publish", () => {
    expect(gbp.validate(ch, { format: "text", text: "hi", media: [] })[0].code).toBe("publishing_unsupported");
    expect(() => gbp.publish(cred, ch, { idempotencyKey: "k", format: "text", text: "hi", media: [] })).toThrow(ProviderError);
  });

  it("lists locations as account-scoped v4 resource names", async () => {
    const calls = stub({
      mybusinessaccountmanagement: () => ({ body: { accounts: [{ name: "accounts/1", accountName: "Acme" }] } }),
      mybusinessbusinessinformation: () => ({ body: { locations: [{ name: "locations/2", title: "Acme Coffee", storeCode: "AC-1" }] } }),
    });
    const channels = await gbp.listChannels(cred);
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({ remoteId: LOCATION, kind: "gbp_location", network: "google_business", name: "Acme Coffee", handle: "AC-1" });
    expect(calls[1].url).toContain("readMask=name%2Ctitle%2CstoreCode%2CstorefrontAddress%2CwebsiteUri%2Cmetadata");
  });

  it("asks Google only for business.manage", () => {
    const url = gbp.authorizationUrl({ state: "s", redirectUri: "https://app.example/cb" });
    expect(url).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fbusiness.manage");
    expect(url).toContain("access_type=offline");
  });
});

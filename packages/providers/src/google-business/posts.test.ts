import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleBusinessProvider } from "./index";
import { capsFor } from "./client";
import { findPublication, postBody, postIssues, publicationStatus, publish, type GbpPostSettings } from "./posts";
import type { ChannelDescriptor, Credential, PublishRequest } from "../types";

const gbp = createGoogleBusinessProvider({ clientId: "id", clientSecret: "secret" });
const cred: Credential = { accessToken: "tok", scopes: ["https://www.googleapis.com/auth/business.manage"], providerUserId: "accounts/1" };
const LOCATION = "accounts/1/locations/2";
const ch: ChannelDescriptor = { remoteId: LOCATION, kind: "gbp_location", network: "google_business", name: "Acme Coffee", capabilities: capsFor(cred) };
const photo = { url: "https://cdn.example/latte.jpg", mimeType: "image/jpeg" };
const req = (over: Partial<PublishRequest> & { settings?: GbpPostSettings } = {}): PublishRequest => ({ idempotencyKey: "k1", format: "text", text: "Fresh beans this week.", media: [], ...over });

function stub(routes: Record<string, (init?: RequestInit) => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k) && (!k.startsWith("POST ") || init?.method === "POST"));
    const r = key ? routes[key](init) : { status: 404, body: { error: { code: 404, message: "not found", errors: [{ reason: "notFound" }] } } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("postBody", () => {
  it("makes a standard post, and turns a post link into a Learn more button when no button was chosen", () => {
    expect(postBody(req({ link: "https://acme.example/beans", media: [photo] }))).toEqual({
      languageCode: "en-US", summary: "Fresh beans this week.", topicType: "STANDARD",
      callToAction: { actionType: "LEARN_MORE", url: "https://acme.example/beans" },
      media: [{ mediaFormat: "PHOTO", sourceUrl: photo.url }],
    });
    expect(postBody(req())).toEqual({ languageCode: "en-US", summary: "Fresh beans this week.", topicType: "STANDARD" });
  });

  it("sends no url with a Call button and none at all for “no button”", () => {
    expect(postBody(req({ link: "https://acme.example", settings: { callToAction: { actionType: "CALL" } } })).callToAction).toEqual({ actionType: "CALL" });
    expect(postBody(req({ link: "https://acme.example", settings: { callToAction: { actionType: "NONE" } } })).callToAction).toBeUndefined();
  });

  it("maps event dates and times onto Google's Date and TimeOfDay, and offers carry their event and coupon", () => {
    const settings: GbpPostSettings = { topicType: "OFFER", event: { title: "Two for one", startDate: "2026-10-01", startTime: "09:00", endDate: "2026-10-07", endTime: "17:30" }, offer: { couponCode: "BOGO", redeemOnlineUrl: "https://acme.example/redeem", termsConditions: " While stocks last " }, languageCode: "en-GB" };
    expect(postBody(req({ settings }))).toEqual({
      languageCode: "en-GB", summary: "Fresh beans this week.", topicType: "OFFER",
      event: { title: "Two for one", schedule: { startDate: { year: 2026, month: 10, day: 1 }, startTime: { hours: 9, minutes: 0 }, endDate: { year: 2026, month: 10, day: 7 }, endTime: { hours: 17, minutes: 30 } } },
      offer: { couponCode: "BOGO", redeemOnlineUrl: "https://acme.example/redeem", termsConditions: "While stocks last" },
    });
  });
});

describe("postIssues", () => {
  const codes = (r: PublishRequest) => postIssues(r).map((i) => i.code);
  it("requires text or a photo, a title and dates for events and offers, and a link for a button", () => {
    expect(codes(req({ text: " " }))).toEqual(["empty_post"]);
    expect(codes(req({ text: "", media: [photo] }))).toEqual([]);
    expect(codes(req({ settings: { topicType: "EVENT" } }))).toEqual(["event_title_required", "event_dates_required"]);
    expect(codes(req({ settings: { topicType: "EVENT", event: { title: "Tasting", startDate: "2026-10-07", endDate: "2026-10-01" } } }))).toEqual(["event_ends_before_start"]);
    expect(codes(req({ settings: { topicType: "EVENT", event: { title: "Tasting", startDate: "2026-10-01", startTime: "9am", endDate: "2026-10-01" } } }))).toEqual(["event_time_invalid"]);
    expect(codes(req({ settings: { callToAction: { actionType: "BOOK" } } }))).toEqual(["button_needs_link"]);
    expect(codes(req({ link: "https://acme.example", settings: { callToAction: { actionType: "BOOK" } } }))).toEqual([]);
    expect(codes(req({ media: [{ url: "https://cdn.example/clip.mp4", mimeType: "video/mp4" }] }))).toEqual(["video_unsupported"]);
  });

  it("runs after the capability validator through the adapter, so the 1,500-character limit and the one-photo rule apply", () => {
    const long = gbp.validate(ch, { format: "text", text: "x".repeat(1501), media: [] });
    expect(long.map((i) => i.code)).toContain("text_too_long");
    const two = gbp.validate(ch, { format: "image", text: "hi", media: [photo, { ...photo, url: "https://cdn.example/2.jpg" }] });
    expect(two.map((i) => i.code)).toContain("too_many_images");
  });
});

describe("publish / reconcile / status", () => {
  it("creates the post and reports its name and search link", async () => {
    const calls = stub({ "POST /localPosts": () => ({ body: { name: `${LOCATION}/localPosts/9`, state: "LIVE", searchUrl: "https://g.co/p/9", createTime: "2026-09-06T10:00:00Z" } }), "/localPosts": () => ({ body: { name: `${LOCATION}/localPosts/9`, state: "LIVE", searchUrl: "https://g.co/p/9", createTime: "2026-09-06T10:00:00Z" } }) });
    const r = await publish(cred, ch, req({ link: "https://acme.example" }));
    expect(r).toEqual({ remoteId: `${LOCATION}/localPosts/9`, url: "https://g.co/p/9", publishedAt: "2026-09-06T10:00:00Z" });
    expect(calls[0].url).toBe(`https://mybusiness.googleapis.com/v4/${LOCATION}/localPosts`);
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ topicType: "STANDARD", callToAction: { actionType: "LEARN_MORE" } });
  });

  it("treats a post Google rejected as a policy failure, not a success", async () => {
    stub({ "/localPosts": () => ({ body: { name: `${LOCATION}/localPosts/10`, state: "REJECTED" } }) });
    await expect(publish(cred, ch, req({ idempotencyKey: "rej" }))).rejects.toMatchObject({ category: "policy", providerCode: "REJECTED", retryable: false });
  });

  it("reconciles an ambiguous create by finding the same text created after the attempt started", async () => {
    stub({ "/localPosts": (init) => (init?.method === "POST" ? { status: 503, body: { error: { code: 503, message: "backend" } } } : { body: { localPosts: [{ name: `${LOCATION}/localPosts/7`, summary: "Fresh beans this week.", createTime: "2099-01-01T00:00:00Z", searchUrl: "https://g.co/p/7" }, { name: `${LOCATION}/localPosts/1`, summary: "Fresh beans this week.", createTime: "2020-01-01T00:00:00Z" }] } }) });
    await expect(publish(cred, ch, req({ idempotencyKey: "amb" }))).rejects.toMatchObject({ ambiguous: true });
    expect(await findPublication(cred, ch, "amb")).toMatchObject({ remoteId: `${LOCATION}/localPosts/7`, url: "https://g.co/p/7" });
    expect(await findPublication(cred, ch, "never-tried")).toBeNull();
  });

  it("reads LIVE as published, PROCESSING as processing, a missing post as deleted, and REJECTED as unknown", async () => {
    stub({ "/localPosts/live": () => ({ body: { state: "LIVE", searchUrl: "https://g.co/p/live" } }), "/localPosts/proc": () => ({ body: { state: "PROCESSING" } }), "/localPosts/rej": () => ({ body: { state: "REJECTED" } }) });
    expect(await publicationStatus(cred, `${LOCATION}/localPosts/live`)).toEqual({ state: "published", url: "https://g.co/p/live" });
    expect(await publicationStatus(cred, `${LOCATION}/localPosts/proc`)).toEqual({ state: "processing" });
    expect(await publicationStatus(cred, `${LOCATION}/localPosts/rej`)).toEqual({ state: "unknown" });
    expect(await publicationStatus(cred, `${LOCATION}/localPosts/gone`)).toEqual({ state: "deleted" });
  });
});

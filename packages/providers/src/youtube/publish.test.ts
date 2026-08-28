import { afterEach, describe, expect, it, vi } from "vitest";
import { createYouTubeProvider } from "./index";
import { capsFor, mapYouTubeError } from "./client";
import { titleFor, videoBody } from "./publish";
import type { ChannelDescriptor, Credential, PublishRequest } from "../types";

const cfg = { clientId: "id", clientSecret: "secret" };
const yt = createYouTubeProvider(cfg);
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
const cred: Credential = { accessToken: "tok", scopes: SCOPES, providerUserId: "UC_me" };
const ch: ChannelDescriptor = { remoteId: "UC_me", kind: "youtube_channel", network: "youtube", name: "Acme", capabilities: capsFor(cred) };

const VIDEO = { url: "https://media.test/clip.mp4", mimeType: "video/mp4", bytes: 1024, width: 1080, height: 1920, durationSeconds: 45 };
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ idempotencyKey: "abcdef12-key", format: "video", text: "Launch day\nThe full story of our launch.", media: [VIDEO], ...over });

type Route = (init?: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string>; text?: string };

function stub(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key](init) : { status: 404, body: { error: { code: 404, errors: [{ reason: "notFound" }], message: "not found" } } };
      const body = r.text ?? JSON.stringify(r.body ?? {});
      return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

/* Error bodies follow the Google API envelope: { error: { code, message, errors: [{ reason }] } }. */
describe("mapYouTubeError", () => {
  it("maps quota and rate limits to a retryable rate_limit", () => {
    const quota = mapYouTubeError(403, { error: { code: 403, message: "quota exceeded", errors: [{ reason: "quotaExceeded" }] } });
    expect(quota).toMatchObject({ category: "rate_limit", retryable: true, retryAfterSeconds: 3600, providerCode: "quotaExceeded" });
    expect(mapYouTubeError(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } }).retryAfterSeconds).toBe(60);
  });

  it("maps auth, validation, missing and transient reasons", () => {
    expect(mapYouTubeError(401, { error: { errors: [{ reason: "authError" }], message: "Invalid Credentials" } }).category).toBe("permission");
    expect(mapYouTubeError(400, { error: { errors: [{ reason: "invalidTitle" }] } }).category).toBe("validation");
    expect(mapYouTubeError(404, { error: { errors: [{ reason: "videoNotFound" }] } }).category).toBe("deleted");
    expect(mapYouTubeError(503, { error: { errors: [{ reason: "backendError" }] } }, { ambiguous: true })).toMatchObject({ category: "temporary", ambiguous: true, retryable: true });
  });
});

describe("YouTube publish request shaping", () => {
  it("takes the title from the first line and caps the description", () => {
    expect(titleFor(req())).toBe("Launch day");
    expect(titleFor(req({ text: "", settings: { title: "x".repeat(150) } }))).toHaveLength(100);
    expect(titleFor(req({ text: "" }))).toBe("Untitled");
  });

  it("forces privacyStatus private when publishAt is set (the API rejects a scheduled public video)", () => {
    const scheduled = videoBody(req({ settings: { publishAt: "2026-09-01T10:00:00Z", privacy: "public" } }));
    expect(scheduled.status).toMatchObject({ privacyStatus: "private", publishAt: "2026-09-01T10:00:00Z" });
    expect(videoBody(req({ settings: { privacy: "unlisted" } })).status.privacyStatus).toBe("unlisted");
    expect(videoBody(req()).status.privacyStatus).toBe("public");
  });

  it("opens a resumable session then PUTs the bytes to the returned Location", async () => {
    const calls = stub({
      "upload/youtube/v3/videos": () => ({ headers: { location: "https://upload.test/session-1" } }),
      "media.test/clip.mp4": () => ({ text: "binary" }),
      "upload.test/session-1": () => ({ body: { id: "vid_1", snippet: { publishedAt: "2026-08-28T09:00:00Z" } } }),
    });
    const r = await yt.publish(cred, ch, req());
    expect(r).toMatchObject({ remoteId: "vid_1", url: "https://www.youtube.com/watch?v=vid_1", publishedAt: "2026-08-28T09:00:00Z" });

    const init = calls[0].init!;
    const headers = init.headers as Record<string, string>;
    expect(calls[0].url).toContain("uploadType=resumable&part=snippet,status");
    expect(headers["X-Upload-Content-Type"]).toBe("video/mp4");
    expect(headers["X-Upload-Content-Length"]).toBe("1024");
    expect(JSON.parse(String(init.body)).snippet.title).toBe("Launch day");
    expect(calls[2].init?.method).toBe("PUT");
  });

  it("treats a 5xx on the byte upload as ambiguous so the worker reconciles first", async () => {
    stub({
      "upload/youtube/v3/videos": () => ({ headers: { location: "https://upload.test/session-2" } }),
      "media.test/clip.mp4": () => ({ text: "binary" }),
      "upload.test/session-2": () => ({ status: 500, body: { error: { errors: [{ reason: "backendError" }], message: "boom" } } }),
    });
    await expect(yt.publish(cred, ch, req())).rejects.toMatchObject({ category: "temporary", ambiguous: true });
  });
});

describe("YouTube Shorts validation", () => {
  it("rejects a landscape or over-long video as a Short and accepts a vertical one", () => {
    const codes = (r: PublishRequest) => yt.validate(ch, r).filter((i) => i.severity === "error").map((i) => i.code);
    expect(codes(req({ format: "reel" }))).toEqual([]);
    expect(codes(req({ format: "reel", media: [{ ...VIDEO, width: 1920, height: 1080 }] }))).toContain("shorts_aspect_ratio");
    expect(codes(req({ format: "reel", media: [{ ...VIDEO, durationSeconds: 400 }] }))).toContain("shorts_aspect_ratio");
  });
});

describe("YouTube reconciliation", () => {
  it("finds an ambiguous upload by the key marker in the uploads playlist", async () => {
    stub({
      "/playlistItems": () => ({ body: { items: [{ contentDetails: { videoId: "vid_9", videoPublishedAt: "2026-08-28T08:00:00Z" }, snippet: { title: "t", description: "ref abcdef12" } }] } }),
    });
    expect(await yt.findPublication!(cred, ch, "abcdef12-key")).toMatchObject({ remoteId: "vid_9" });
    expect(await yt.findPublication!(cred, ch, "zzzzzzzz-key")).toBeNull();
  });

  it("reports processing and deleted videos through publicationStatus", async () => {
    stub({ "/videos?part=status": () => ({ body: { items: [{ id: "vid_1", status: { uploadStatus: "uploaded" } }] } }) });
    expect(await yt.publicationStatus(cred, ch, "vid_1")).toMatchObject({ state: "processing" });
    stub({ "/videos?part=status": () => ({ body: { items: [] } }) });
    expect(await yt.publicationStatus(cred, ch, "vid_1")).toMatchObject({ state: "deleted" });
  });
});

describe("YouTube capabilities", () => {
  it("turns features off with a reason when a scope was not granted", () => {
    const caps = capsFor({ ...cred, scopes: ["https://www.googleapis.com/auth/youtube.readonly"] });
    expect(caps.formats).toEqual([]);
    expect(caps.inbox).toMatchObject({ comments: false, reply: false, messages: false });
    expect(caps.insights).toMatchObject({ organic: false });
    expect(caps.reasons?.comments).toMatch(/force-ssl/);
    expect(caps.reasons?.messages).toMatch(/no API for direct messages/);
    expect(caps.ingestion).toEqual({ webhooks: false, polling: true });
  });

  it("has no webhook surface at all", () => {
    expect(yt.verifyWebhook).toBeUndefined();
    expect(yt.parseWebhook).toBeUndefined();
  });
});

/*
 * The rules worth pinning: the exact queue contract (URL, header, body), what
 * each row refuses locally before any spend, that the vendor-returned URLs
 * win over constructed ones, and what a job is allowed to bill.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelByKey } from "../catalog";
import { estimate } from "../cost";
import type { GenerationSpec, MediaJobHandle } from "../types";
import { falAdapter, inputFor, referenceDataUri, urlsFrom, FLUX_SIZES, MAX_REFERENCE_BYTES, __resetFalJobs } from "./index";

const i2v = () => modelByKey("fal-kling-25-pro-i2v")!;
const t2v = () => modelByKey("fal-kling-25-pro-t2v")!;
const flux = () => modelByKey("fal-flux-2-pro")!;

const spec = (over: Partial<GenerationSpec> = {}): GenerationSpec => ({ jobKind: "hero_shot", prompt: "a lemon rotating", ...over });
const ref = (bytes = new Uint8Array([1, 2, 3])) => ({ assetId: "a1", role: "product" as const, bytes, mimeType: "image/png" });

const handle = (over: Partial<MediaJobHandle> = {}): MediaJobHandle => ({
  adapter: "fal",
  modelKey: "fal-kling-25-pro-t2v",
  remoteJobId: "req_1",
  idempotencyKey: "media_1",
  meta: { statusUrl: "https://queue.fal.run/x/requests/req_1/status", responseUrl: "https://queue.fal.run/x/requests/req_1", quantity: 5, unit: "video_seconds" },
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const bad = (status: number, body: unknown = null) => ({ ok: false, status, json: async () => body });

beforeEach(() => {
  __resetFalJobs();
  vi.stubEnv("FAL_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("is unconfigured without FAL_KEY", () => {
    vi.stubEnv("FAL_KEY", "");
    expect(falAdapter().configured()).toBe(false);
  });

  it("is never synchronous — a clip renders for minutes and must be polled", () => {
    expect(falAdapter().synchronous).toBeFalsy();
  });
});

describe("what each row accepts", () => {
  it("takes only 5 or 10 seconds, and says which", () => {
    expect(() => inputFor(t2v(), spec({ durationSeconds: 7 }))).toThrow(/5 or 10/);
  });

  it("defaults to the shortest clip rather than the most expensive", () => {
    expect(inputFor(t2v(), spec())).toMatchObject({ duration: "5" });
  });

  it("sends the vendor's field names verbatim for text-to-video", () => {
    expect(inputFor(t2v(), spec({ durationSeconds: 10, aspect: "9:16", negativePrompt: "blurry" }))).toEqual({
      prompt: "a lemon rotating",
      duration: "10",
      aspect_ratio: "9:16",
      negative_prompt: "blurry",
    });
  });

  it("image-to-video refuses without a reference image — the vendor would only find out after billing risk", () => {
    expect(() => inputFor(i2v(), spec())).toThrow(/reference image/);
  });

  it("hands the reference over as a data URI", () => {
    const input = inputFor(i2v(), spec({ references: [ref()] }));
    expect(input.image_url).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
  });

  it("prefers the product reference over style, in the fixed order", () => {
    const style = { assetId: "s", role: "style" as const, bytes: new Uint8Array([9]), mimeType: "image/jpeg" };
    expect(referenceDataUri(spec({ references: [style, ref()] }))).toContain("image/png");
  });

  it("refuses a reference too large to send inline instead of discovering the gateway limit at spend time", () => {
    const big = ref(new Uint8Array(MAX_REFERENCE_BYTES + 1));
    expect(() => referenceDataUri(spec({ references: [big] }))).toThrow(/too large/);
  });

  it("maps aspect to FLUX's named size presets and pins PNG output", () => {
    expect(inputFor(flux(), spec({ jobKind: "scene_still", aspect: "1:1", seed: 42 }))).toEqual({
      prompt: "a lemon rotating",
      image_size: FLUX_SIZES["1:1"],
      output_format: "png",
      seed: 42,
    });
  });
});

describe("start", () => {
  it("POSTs the full pathed model id with the Key auth scheme, and keeps the vendor's URLs in meta", async () => {
    const f = vi.fn().mockResolvedValue(ok({ request_id: "req_9", status_url: "https://queue.fal.run/fal-ai/kling-video/requests/req_9/status", response_url: "https://queue.fal.run/fal-ai/kling-video/requests/req_9" }));
    vi.stubGlobal("fetch", f);

    const h = await falAdapter().start(t2v(), spec({ durationSeconds: 10 }), "media_1");

    expect(f.mock.calls[0][0]).toBe("https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/text-to-video");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Key test-key");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ prompt: "a lemon rotating", duration: "10" });
    expect(h.remoteJobId).toBe("req_9");
    // The billed quantity rides in meta because fal never echoes it back.
    expect(h.meta).toMatchObject({ statusUrl: expect.stringContaining("req_9"), quantity: 10, unit: "video_seconds" });
  });

  it("a validation refusal happens before anything was sent, so reconcile still says never-started", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(falAdapter().start(i2v(), spec(), "media_2")).rejects.toThrow(/reference image/);
    expect(f).not.toHaveBeenCalled();
    await expect(falAdapter().reconcile("media_2")).resolves.toBeNull();
  });

  it("an accepted job with no request id is ambiguous — it may exist and be billing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({})));
    await expect(falAdapter().start(t2v(), spec(), "media_3")).rejects.toMatchObject({ ambiguous: true });
  });
});

describe("poll", () => {
  it("maps IN_QUEUE and IN_PROGRESS, and an unknown status stays running — never finished", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ status: "IN_QUEUE" })).mockResolvedValueOnce(ok({ status: "IN_PROGRESS" })).mockResolvedValueOnce(ok({ status: "SOMETHING_NEW" }));
    vi.stubGlobal("fetch", f);
    expect((await falAdapter().poll(handle())).status).toBe("queued");
    expect((await falAdapter().poll(handle())).status).toBe("running");
    expect((await falAdapter().poll(handle())).status).toBe("running");
  });

  it("polls the vendor-returned status URL, not a constructed one", async () => {
    const f = vi.fn().mockResolvedValue(ok({ status: "IN_PROGRESS" }));
    vi.stubGlobal("fetch", f);
    await falAdapter().poll(handle());
    expect(f.mock.calls[0][0]).toBe("https://queue.fal.run/x/requests/req_1/status");
  });

  it("falls back to the documented URL shape for a row written before meta was persisted", async () => {
    const f = vi.fn().mockResolvedValue(ok({ status: "IN_PROGRESS" }));
    vi.stubGlobal("fetch", f);
    await falAdapter().poll(handle({ meta: undefined }));
    expect(f.mock.calls[0][0]).toBe("https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/text-to-video/requests/req_1/status");
  });

  it("on COMPLETED it reads the response and bills exactly the requested seconds at the published rate", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ status: "COMPLETED" })).mockResolvedValueOnce(ok({ video: { url: "https://cdn.fal/x.mp4" } }));
    vi.stubGlobal("fetch", f);
    const state = await falAdapter().poll(handle());
    expect(state.status).toBe("succeeded");
    expect(state.outputUrls).toEqual(["https://cdn.fal/x.mp4"]);
    // 5s × $0.07/s, verified on the model page — reported so the ceiling is
    // armed without a config step (docs/bugs/B-009).
    expect(state.usage).toEqual({ quantity: 5, unit: "video_seconds", costUsd: 0.35 });
  });

  it("a 422 from the response endpoint is the completed job's own verdict — failed, not retried", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ status: "COMPLETED" })).mockResolvedValueOnce(bad(422, { detail: "content policy" }));
    vi.stubGlobal("fetch", f);
    const state = await falAdapter().poll(handle());
    expect(state.status).toBe("failed");
    expect(state.error?.message).toMatch(/content policy/);
  });

  it("a 500 from the response endpoint is rethrown so the next sweep retries", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ status: "COMPLETED" })).mockResolvedValueOnce(bad(500));
    vi.stubGlobal("fetch", f);
    await expect(falAdapter().poll(handle())).rejects.toMatchObject({ category: "temporary" });
  });

  it("a completed job naming no output is failed, not silently empty", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ status: "COMPLETED" })).mockResolvedValueOnce(ok({}));
    vi.stubGlobal("fetch", f);
    const state = await falAdapter().poll(handle());
    expect(state.status).toBe("failed");
    expect(state.usage).toBeUndefined(); // nothing collected, nothing billed here
  });
});

describe("fetch", () => {
  it("downloads every named output without sending the API key to the CDN", async () => {
    const bytes = new Uint8Array([7, 7]).buffer;
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => bytes });
    vi.stubGlobal("fetch", f);
    const outs = await falAdapter().fetch({ handle: handle(), status: "succeeded", outputUrls: ["https://cdn.fal/x.mp4"] });
    expect(outs[0].claimedMimeType).toBe("video/mp4");
    expect(f.mock.calls[0][1]?.headers).toBeUndefined();
  });
});

describe("reconcile", () => {
  it("throws for a key this process attempted — fal has no idempotency lookup, so a lost answer is resolved by hand", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bad(503)));
    await expect(falAdapter().start(t2v(), spec(), "media_4")).rejects.toMatchObject({ ambiguous: true });
    await expect(falAdapter().reconcile("media_4")).rejects.toMatchObject({ ambiguous: true });
  });
});

describe("cost and output shapes", () => {
  it("estimates from the verified page rate with no deployment config", () => {
    expect(estimate(t2v(), spec({ durationSeconds: 10 }))).toMatchObject({ unit: "video_seconds", amountUsd: 0.7, verified: true });
    expect(estimate(flux(), spec({ jobKind: "scene_still" }))).toMatchObject({ unit: "images", amountUsd: 0.03, verified: true });
  });

  it("collects urls from the video, audio and images shapes fal's models use", () => {
    expect(urlsFrom({ video: { url: "v" }, images: [{ url: "i1" }, {}], audio: { url: "a" } })).toEqual(["v", "a", "i1"]);
    expect(urlsFrom(null)).toEqual([]);
  });
});

/*
 * The rules worth pinning: what Azure actually accepts, and what a job that
 * has not succeeded is allowed to bill.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelByKey } from "../catalog";
import { estimate } from "../cost";
import type { GenerationSpec } from "../types";
import { secondsFor, sizeFor, soraAdapter, __resetSoraJobs } from "./index";

const model = () => modelByKey("azure-sora-2")!;
const spec = (over: Partial<GenerationSpec> = {}): GenerationSpec => ({ jobKind: "hero_shot", prompt: "a lemon rotating", ...over });

beforeEach(() => {
  __resetSoraJobs();
  vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://x.openai.azure.com");
  vi.stubEnv("AZURE_OPENAI_API_KEY", "k");
  vi.stubEnv("AZURE_OPENAI_VIDEO_DEPLOYMENT", "rocketease-video");
  vi.stubEnv("AZURE_OPENAI_VIDEO_API_VERSION", "preview");
});
afterEach(() => vi.unstubAllEnvs());

describe("configuration", () => {
  it("is unconfigured without the video deployment, even with the images key present", () => {
    vi.stubEnv("AZURE_OPENAI_VIDEO_DEPLOYMENT", "");
    expect(soraAdapter().configured()).toBe(false);
  });

  it("is never synchronous — a job runs for minutes and must be polled", () => {
    expect(soraAdapter().synchronous).toBeFalsy();
  });
});

describe("what Azure accepts", () => {
  it("takes only the durations Azure allows, and says which", () => {
    expect(secondsFor(model(), spec({ durationSeconds: 8 }))).toBe(8);
    expect(() => secondsFor(model(), spec({ durationSeconds: 6 }))).toThrow(/4, 8, 12/);
  });

  it("defaults to the shortest clip rather than the most expensive", () => {
    expect(secondsFor(model(), spec())).toBe(4);
  });

  it("renders the two social aspects and refuses the rest by name", () => {
    expect(sizeFor(spec({ aspect: "9:16" }))).toEqual({ width: 720, height: 1280 });
    expect(sizeFor(spec({ aspect: "16:9" }))).toEqual({ width: 1280, height: 720 });
    expect(() => sizeFor(spec({ aspect: "1:1" }))).toThrow(/9:16 and 16:9/);
  });
});

describe("cost", () => {
  it("bills per second, so a 12s clip costs three times a 4s one", () => {
    const rate = { "azure-sora-2": 0.1 };
    const short = estimate(model(), spec({ durationSeconds: 4 }), rate);
    const long = estimate(model(), spec({ durationSeconds: 12 }), rate);
    expect(short).toMatchObject({ unit: "video_seconds", amountUsd: 0.4 });
    expect(long).toMatchObject({ unit: "video_seconds", amountUsd: 1.2 });
  });

  it("refuses to guess with no configured rate — Azure publishes no meter for sora", () => {
    expect(estimate(model(), spec({ durationSeconds: 4 }), {})).toHaveProperty("unknown");
  });
});

describe("reconcile", () => {
  it("says 'never started' for a key this process never sent", async () => {
    await expect(soraAdapter().reconcile("media_unknown")).resolves.toBeNull();
  });

  it("refuses to answer for a key it did send, rather than inviting a re-spend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    await expect(soraAdapter().start(model(), spec(), "media_k1")).rejects.toThrow();
    await expect(soraAdapter().reconcile("media_k1")).rejects.toThrow(/cannot be looked up/);
    vi.unstubAllGlobals();
  });
});

/** A poll response, as the job API documents it. */
const reply = (body: Record<string, unknown>) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

describe("poll", () => {
  const handle = { adapter: "azure-sora", modelKey: "azure-sora-2", remoteJobId: "task_1", idempotencyKey: "k" };

  it("bills a succeeded job for the seconds it was asked for", async () => {
    vi.stubGlobal("fetch", reply({ id: "task_1", status: "succeeded", n_seconds: 8, n_variants: 1, generations: [{ id: "gen_1" }] }));
    const s = await soraAdapter().poll(handle);
    expect(s.status).toBe("succeeded");
    expect(s.usage).toEqual({ quantity: 8, unit: "video_seconds" });
    expect(s.outputUrls).toEqual(["gen_1"]);
    vi.unstubAllGlobals();
  });

  it("bills NOTHING for a failed job — a job that produced no video was not charged", async () => {
    vi.stubGlobal("fetch", reply({ id: "task_1", status: "failed", n_seconds: 12, failure_reason: "content policy" }));
    const s = await soraAdapter().poll(handle);
    expect(s.status).toBe("failed");
    expect(s.usage).toBeUndefined();
    expect(s.error?.message).toContain("content policy");
    vi.unstubAllGlobals();
  });

  it("bills nothing while the job is still running", async () => {
    vi.stubGlobal("fetch", reply({ id: "task_1", status: "preprocessing", n_seconds: 4 }));
    const s = await soraAdapter().poll(handle);
    expect(s.status).toBe("running");
    expect(s.usage).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("treats an unrecognised status as running, never as finished", async () => {
    vi.stubGlobal("fetch", reply({ id: "task_1", status: "something_new", n_seconds: 4 }));
    expect((await soraAdapter().poll(handle)).status).toBe("running");
    vi.unstubAllGlobals();
  });

  it("counts every variant, so 2 x 8s bills 16 seconds", async () => {
    vi.stubGlobal("fetch", reply({ id: "task_1", status: "succeeded", n_seconds: 8, n_variants: 2, generations: [{ id: "a" }, { id: "b" }] }));
    expect((await soraAdapter().poll(handle)).usage).toEqual({ quantity: 16, unit: "video_seconds" });
    vi.unstubAllGlobals();
  });
});

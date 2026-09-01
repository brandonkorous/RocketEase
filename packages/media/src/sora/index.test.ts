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
    // One `size` string, not width and height — the API rejects both of those
    // as unknown parameters.
    expect(sizeFor(spec({ aspect: "9:16" }))).toBe("720x1280");
    expect(sizeFor(spec({ aspect: "16:9" }))).toBe("1280x720");
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

/*
 * Fixtures are the REAL response bodies, copied from live calls against
 * oai-rocketease-prod-eus2 on 2026-09-01. The first version of this file
 * invented them, and every test passed while the adapter called a path that
 * did not exist (docs/bugs/B-006) — so shape is asserted, not assumed.
 */
const reply = (body: Record<string, unknown>) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

const completed = {
  id: "video_6a96b4a4681c8190b36d0b7af9064c06",
  object: "video",
  created_at: 1788261540,
  status: "completed",
  completed_at: 1788261591,
  error: null,
  expires_at: 1788347940,
  model: "rocketease-video",
  progress: 100,
  prompt: "a ceramic mug",
  remixed_from_video_id: null,
  seconds: "4",
  size: "720x1280",
};

describe("the request we actually send", () => {
  it("posts to /openai/v1/videos — not the /video/generations/jobs path, which 404s", async () => {
    const f = reply(completed);
    vi.stubGlobal("fetch", f);
    await soraAdapter().start(model(), spec({ durationSeconds: 8, aspect: "16:9" }), "media_url");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.openai.azure.com/openai/v1/videos?api-version=preview");
    // `seconds` as a number is a 400; `width`/`height` are unknown parameters.
    expect(JSON.parse(init.body)).toEqual({ model: "rocketease-video", prompt: "a lemon rotating", size: "1280x720", seconds: "8" });
    vi.unstubAllGlobals();
  });

  it("polls and downloads under the same /videos path, keyed by the video id", async () => {
    const f = reply(completed);
    vi.stubGlobal("fetch", f);
    await soraAdapter().poll({ adapter: "azure-sora", modelKey: "azure-sora-2", remoteJobId: "video_1", idempotencyKey: "k" });
    expect(f.mock.calls[0][0]).toBe("https://x.openai.azure.com/openai/v1/videos/video_1?api-version=preview");
    vi.unstubAllGlobals();
  });
});

describe("poll", () => {
  const handle = { adapter: "azure-sora", modelKey: "azure-sora-2", remoteJobId: "video_1", idempotencyKey: "k" };

  it("bills a completed job for the seconds the vendor echoes back", async () => {
    vi.stubGlobal("fetch", reply({ ...completed, seconds: "8" }));
    const s = await soraAdapter().poll(handle);
    expect(s.status).toBe("succeeded");
    // "8" is a string on the wire. Number-coercing it is the whole reason this
    // asserts a number rather than trusting the field.
    expect(s.usage).toEqual({ quantity: 8, unit: "video_seconds" });
    vi.unstubAllGlobals();
  });

  it("names the video itself as the output — there is no generations[] array", async () => {
    vi.stubGlobal("fetch", reply(completed));
    expect((await soraAdapter().poll(handle)).outputUrls).toEqual([completed.id]);
    vi.unstubAllGlobals();
  });

  it("bills NOTHING for a failed job — a job that produced no video was not charged", async () => {
    vi.stubGlobal("fetch", reply({ ...completed, status: "failed", error: { message: "content policy", code: null } }));
    const s = await soraAdapter().poll(handle);
    expect(s.status).toBe("failed");
    expect(s.usage).toBeUndefined();
    expect(s.error?.message).toContain("content policy");
    vi.unstubAllGlobals();
  });

  it("bills nothing, and names no output, while the job is still running", async () => {
    vi.stubGlobal("fetch", reply({ ...completed, status: "in_progress", progress: 40, completed_at: null }));
    const s = await soraAdapter().poll(handle);
    expect(s.status).toBe("running");
    expect(s.usage).toBeUndefined();
    expect(s.outputUrls).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("treats an unrecognised status as running, never as finished", async () => {
    vi.stubGlobal("fetch", reply({ ...completed, status: "something_new" }));
    expect((await soraAdapter().poll(handle)).status).toBe("running");
    vi.unstubAllGlobals();
  });

  it("reads the expiry the vendor gives, which is a day rather than an hour", async () => {
    vi.stubGlobal("fetch", reply(completed));
    const s = await soraAdapter().poll(handle);
    expect(new Date(s.expiresAt!).getTime() - completed.created_at * 1000).toBe(86_400_000);
    vi.unstubAllGlobals();
  });
});

describe("errors", () => {
  const fail = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: false, status, json: async () => body });

  it("blames the deployment only when Azure says DeploymentNotFound", async () => {
    vi.stubGlobal("fetch", fail(404, { error: { message: "The API deployment for this resource does not exist.", code: "DeploymentNotFound" } }));
    await expect(soraAdapter().start(model(), spec(), "media_404a")).rejects.toThrow(/No such video deployment/);
    vi.unstubAllGlobals();
  });

  it("passes a plain 404 through verbatim — a wrong path is not a wrong name", async () => {
    vi.stubGlobal("fetch", fail(404, { error: { message: "Resource not found", code: "404" } }));
    await expect(soraAdapter().start(model(), spec(), "media_404b")).rejects.toThrow(/Resource not found/);
    vi.unstubAllGlobals();
  });

  it("repeats what Azure said about a bad duration rather than paraphrasing it", async () => {
    vi.stubGlobal("fetch", fail(400, { error: { message: "Invalid value: '6'. Supported values are: '4', '8', and '12'.", code: "invalid_value" } }));
    await expect(soraAdapter().start(model(), spec(), "media_400")).rejects.toThrow(/Supported values are: '4', '8', and '12'/);
    vi.unstubAllGlobals();
  });
});

/*
 * The vendor is mocked at fetch; what is under test is OUR behaviour around a
 * synchronous, unlistable endpoint — that one key bills once, that a lost
 * answer is never quietly re-spent, and that a refusal names a category the
 * worker can act on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelByKey } from "../catalog";
import { MediaError, type GenerationSpec } from "../types";
import { __resetOpenAiJobs, azureOpenAiAdapter, openaiAdapter } from "./index";

const model = () => modelByKey("gpt-image-1")!;
const spec: GenerationSpec = { jobKind: "scene_still", prompt: "a quiet street", aspect: "1:1", count: 2 };

/** A one-pixel PNG, so the bytes that come back are a real image. */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const okReply = (n = 2) => ({ ok: true, status: 200, json: async () => ({ data: Array.from({ length: n }, () => ({ b64_json: PNG_B64 })) }) });
const errReply = (status: number, error: Record<string, string> = {}) => ({ ok: false, status, json: async () => ({ error }) });

let calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];

function stubFetch(reply: unknown | (() => unknown)) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    const r = typeof reply === "function" ? (reply as () => unknown)() : reply;
    if (r instanceof Error) throw r;
    return r;
  }));
}

describe("openai images adapter", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    calls = [];
    __resetOpenAiJobs();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is unconfigured without a key, and refuses rather than pretending", async () => {
    delete process.env.OPENAI_API_KEY;
    const a = openaiAdapter();
    expect(a.configured()).toBe(false);
    await expect(a.start(model(), spec, "k1")).rejects.toThrow(/isn't configured/i);
  });

  it("sends the PINNED vendor model id and a size the endpoint documents", async () => {
    stubFetch(okReply());
    await openaiAdapter().start(model(), spec, "k1");
    expect(calls[0].body).toMatchObject({ model: "gpt-image-1", prompt: "a quiet street", n: 2, size: "1024x1024" });
  });

  it("maps each declared aspect to its documented size", async () => {
    stubFetch(okReply(1));
    const a = openaiAdapter();
    await a.start(model(), { ...spec, aspect: "3:2", count: 1 }, "k1");
    await a.start(model(), { ...spec, aspect: "2:3", count: 1 }, "k2");
    expect(calls.map((c) => c.body.size)).toEqual(["1536x1024", "1024x1536"]);
  });

  it("refuses an aspect it doesn't render instead of silently squaring it", async () => {
    stubFetch(okReply());
    await expect(openaiAdapter().start(model(), { ...spec, aspect: "9:16" }, "k1")).rejects.toMatchObject({ category: "validation" });
    expect(calls).toHaveLength(0); // and it costs nothing
  });

  it("runs start → poll → fetch and hands back real bytes", async () => {
    stubFetch(okReply());
    const a = openaiAdapter();
    const handle = await a.start(model(), spec, "k1");
    const state = await a.poll(handle);
    expect(state.status).toBe("succeeded");
    expect(state.usage).toEqual({ quantity: 2, unit: "images" });
    const outputs = await a.fetch(state);
    expect(outputs).toHaveLength(2);
    expect(Buffer.from(outputs[0].bytes).subarray(1, 4).toString()).toBe("PNG");
  });

  it("bills ONE key once — a repeated start does not reach the vendor again", async () => {
    stubFetch(okReply());
    const a = openaiAdapter();
    const first = await a.start(model(), spec, "k1");
    const second = await a.start(model(), spec, "k1");
    expect(second.remoteJobId).toBe(first.remoteJobId);
    expect(calls).toHaveLength(1);
  });

  it("releases the bytes once they are stored, rather than holding megabytes", async () => {
    stubFetch(okReply());
    const a = openaiAdapter();
    const state = await a.poll(await a.start(model(), spec, "k1"));
    await a.fetch(state);
    await expect(a.fetch(state)).rejects.toThrow(/no longer held/i);
  });

  it("says nothing was started for a key it has never seen — safe to start", async () => {
    expect(await openaiAdapter().reconcile("never-seen")).toBeNull();
  });

  it("REFUSES to re-send a key that already reached the vendor", async () => {
    stubFetch(errReply(500));
    const a = openaiAdapter();
    await expect(a.start(model(), spec, "k1")).rejects.toBeInstanceOf(MediaError);
    // The answer was lost, not the spend. Reconcile must not report "nothing here".
    await expect(a.reconcile("k1")).rejects.toMatchObject({ ambiguous: true });
  });

  it("reports a completed job to reconcile, so a redelivery collects it", async () => {
    stubFetch(okReply());
    const a = openaiAdapter();
    await a.start(model(), spec, "k1");
    expect((await a.reconcile("k1"))?.status).toBe("succeeded");
  });

  it.each([
    [401, {}, { category: "permission", retryable: false }],
    [429, {}, { category: "rate_limit", retryable: true }],
    [400, { code: "moderation_blocked" }, { category: "policy", retryable: false }],
    [400, { message: "n must be <= 4" }, { category: "validation", retryable: false }],
    [503, {}, { category: "temporary", ambiguous: true }],
  ])("maps HTTP %i to a category the worker can act on", async (status, error, expected) => {
    stubFetch(errReply(status, error));
    await expect(openaiAdapter().start(model(), spec, "k1")).rejects.toMatchObject(expected);
  });

  it("treats a request that never completed as AMBIGUOUS — it may have been billed", async () => {
    stubFetch(() => new Error("socket hang up"));
    await expect(openaiAdapter().start(model(), spec, "k1")).rejects.toMatchObject({ category: "temporary", ambiguous: true });
  });

  it("refuses an empty reply rather than storing nothing and calling it success", async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ data: [] }) });
    await expect(openaiAdapter().start(model(), spec, "k1")).rejects.toThrow(/no image/i);
  });
});

describe("azure openai images adapter", () => {
  const azureModel = () => modelByKey("azure-gpt-image-1")!;

  beforeEach(() => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://rke.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "azure-test";
    process.env.AZURE_OPENAI_API_VERSION = "2026-01-01";
    delete process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT;
    calls = [];
    __resetOpenAiJobs();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("needs all three settings — an api-version is never guessed", () => {
    expect(azureOpenAiAdapter().configured()).toBe(true);
    delete process.env.AZURE_OPENAI_API_VERSION;
    expect(azureOpenAiAdapter().configured()).toBe(false);
  });

  it("posts to the DEPLOYMENT path, named after the pinned model", async () => {
    stubFetch(okReply());
    await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(calls[0].url).toBe("https://rke.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2026-01-01");
  });

  it("uses the DEPLOYMENT name when the resource calls the model something else", async () => {
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = "rocketease-images";
    stubFetch(okReply());
    await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(calls[0].url).toContain("/deployments/rocketease-images/");
  });

  it("still pins the MODEL in the catalog — only the address changed", async () => {
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = "rocketease-images";
    stubFetch(okReply());
    const handle = await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(azureModel().vendorModelId).toBe("gpt-image-1");
    expect(handle.modelKey).toBe("azure-gpt-image-1");
  });

  it("strips a trailing slash — the classic Azure 404", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://rke.openai.azure.com/";
    stubFetch(okReply());
    await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(calls[0].url).not.toContain("azure.com//");
  });

  it("authenticates with api-key, NOT a bearer token", async () => {
    stubFetch(okReply());
    await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(calls[0].headers["api-key"]).toBe("azure-test");
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it("leaves the model OUT of the body — it is already in the path", async () => {
    stubFetch(okReply());
    await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(calls[0].body).toEqual({ prompt: "a quiet street", n: 2, size: "1024x1024" });
  });

  it("explains a 404 as a deployment-name problem, because that is what it is", async () => {
    stubFetch(errReply(404));
    await expect(azureOpenAiAdapter().start(azureModel(), spec, "k1")).rejects.toMatchObject({ category: "validation" });
  });

  it("maps Azure's content_filter to a policy refusal", async () => {
    stubFetch(errReply(400, { code: "content_filter" }));
    await expect(azureOpenAiAdapter().start(azureModel(), spec, "k1")).rejects.toMatchObject({ category: "policy", retryable: false });
  });

  it("keeps its results separate from the direct adapter's", async () => {
    stubFetch(okReply());
    await azureOpenAiAdapter().start(azureModel(), spec, "shared-key");
    // Same idempotency key, different vendor: the direct adapter must not
    // believe this job is already done and hand back Azure's bytes.
    expect(await openaiAdapter().reconcile("shared-key")).toBeNull();
    expect((await azureOpenAiAdapter().reconcile("shared-key"))?.status).toBe("succeeded");
  });

  it("records the job under its own model key, so history reads back honestly", async () => {
    stubFetch(okReply());
    const handle = await azureOpenAiAdapter().start(azureModel(), spec, "k1");
    expect(handle).toMatchObject({ adapter: "azure-openai", modelKey: "azure-gpt-image-1" });
  });
});

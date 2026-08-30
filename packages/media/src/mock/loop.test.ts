import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_POLLS_BEFORE_DONE, __resetMockJobs, mockAdapter } from "./index";
import { modelByKey } from "../catalog";
import type { GenerationSpec } from "../types";

const model = () => modelByKey("mock-video")!;
const spec: GenerationSpec = { jobKind: "hero_shot", prompt: "a hero shot", durationSeconds: 8 };

async function runToCompletion(a: ReturnType<typeof mockAdapter>, key: string) {
  const handle = await a.start(model(), spec, key);
  let state = await a.poll(handle);
  while (state.status === "running") state = await a.poll(handle);
  return state;
}

describe("mock adapter loop", () => {
  beforeEach(() => {
    process.env.MEDIA_ENABLE_MOCK = "1";
    __resetMockJobs();
  });

  it("is unconfigured without the env flag, and refuses rather than pretending", async () => {
    delete process.env.MEDIA_ENABLE_MOCK;
    const a = mockAdapter();
    expect(a.configured()).toBe(false);
    await expect(a.start(model(), spec, "k1")).rejects.toThrow(/off/i);
  });

  it("runs submit → poll → fetch and returns real bytes", async () => {
    const a = mockAdapter();
    const state = await runToCompletion(a, "k1");
    expect(state.status).toBe("succeeded");
    const outputs = await a.fetch(state);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].bytes.byteLength).toBeGreaterThan(0);
  });

  it("reports running before it is done, so the poller is actually exercised", async () => {
    const a = mockAdapter();
    const handle = await a.start(model(), spec, "k1");
    for (let i = 0; i < MOCK_POLLS_BEFORE_DONE; i++) {
      expect((await a.poll(handle)).status).toBe("running");
    }
    expect((await a.poll(handle)).status).toBe("succeeded");
  });

  it("never starts a second job for the same idempotency key", async () => {
    const a = mockAdapter();
    const first = await a.start(model(), spec, "same-key");
    const second = await a.start(model(), spec, "same-key");
    expect(second.remoteJobId).toBe(first.remoteJobId);
  });

  it("finds a lost job by idempotency key instead of re-spending", async () => {
    const a = mockAdapter();
    const handle = await a.start(model(), spec, "lost");
    const found = await a.reconcile("lost");
    expect(found?.handle.remoteJobId).toBe(handle.remoteJobId);
  });

  it("returns null from reconcile only when no such job exists", async () => {
    expect(await mockAdapter().reconcile("never-started")).toBeNull();
  });

  it("sets an expiry on URL-delivered output, so the fetch deadline is real", async () => {
    const a = mockAdapter();
    const state = await runToCompletion(a, "k1");
    expect(state.expiresAt).toBeTruthy();
    expect(new Date(state.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to fetch expired output rather than returning nothing silently", async () => {
    const a = mockAdapter();
    const state = await runToCompletion(a, "k1");
    await expect(a.fetch({ ...state, expiresAt: new Date(Date.now() - 1000).toISOString() })).rejects.toThrow(/expired/i);
  });

  it("claims a duration describing the FILE, slightly off, so mismatch detection has something to catch", async () => {
    const a = mockAdapter();
    const state = await runToCompletion(a, "k1");
    const [out] = await a.fetch(state);
    expect(out.claimedDurationSeconds).toBe(0.9);
  });

  it("returns a real decodable MP4, so the probe path is exercised locally", async () => {
    const a = mockAdapter();
    const state = await runToCompletion(a, "k1");
    const [out] = await a.fetch(state);
    const bytes = Buffer.from(out.bytes);
    expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("reports usage in the model's billed unit", async () => {
    const a = mockAdapter();
    const state = await runToCompletion(a, "k1");
    expect(state.usage).toEqual({ quantity: 8, unit: "video_seconds", costUsd: 0 });
  });

  it("gives distinct bytes per output so a batch is not deduped into one asset", async () => {
    const a = mockAdapter();
    const image = modelByKey("mock-image")!;
    const handle = await a.start(image, { jobKind: "product_still", prompt: "packshot", count: 3 }, "batch");
    let state = await a.poll(handle);
    while (state.status === "running") state = await a.poll(handle);
    const outputs = await a.fetch(state);
    expect(outputs).toHaveLength(3);
    const sizes = new Set(outputs.map((o) => o.bytes.byteLength));
    expect(sizes.size).toBeGreaterThan(1);
  });
});

/*
 * The ceiling as it is actually reached: environment -> route -> estimate ->
 * refuse. ceiling-policy.test.ts proves the decision; this proves the wiring,
 * and above all that a refusal costs NOTHING — no row, no queued job, no audit,
 * and no adapter touched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  inserted: [] as unknown[],
  emitted: [] as unknown[],
  audited: [] as unknown[],
  spentThisMonth: "0",
};

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {
    // spentSince(): sum of vendor_cost_usd for the org this month.
    select: () => ({ from: () => ({ where: async () => [{ total: state.spentThisMonth }] }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({ values: (v: unknown) => ({ returning: async () => (state.inserted.push(v), [{ id: "mj1" }]) }) }),
      }),
  },
}));

vi.mock("@/lib/audit", () => ({ audit: async (i: unknown) => void state.audited.push(i) }));
vi.mock("@/lib/jobs/outbox", () => ({ emit: async (_tx: unknown, name: string, p: unknown) => void state.emitted.push({ name, p }) }));

const { createMediaJob } = await import("./jobs");

const input = (count: number) => ({
  organizationId: "org1",
  workspaceId: "ws1",
  userId: "u1",
  spec: { jobKind: "scene_still" as const, prompt: "a lemon on a table", aspect: "1:1" as const, count },
});

/** Nothing was spent and nothing was written. */
const wroteNothing = () => expect([state.inserted, state.emitted, state.audited]).toEqual([[], [], []]);

beforeEach(() => {
  state.inserted = [];
  state.emitted = [];
  state.audited = [];
  state.spentThisMonth = "0";
  // Mock is first in registry order, so scene_still routes to mock-image.
  vi.stubEnv("MEDIA_ENABLE_MOCK", "1");
  vi.stubEnv("AI_MEDIA_RATES_JSON", '{"mock-image":0.05}');
  vi.stubEnv("MEDIA_CEILING_USD_PER_JOB", "");
  vi.stubEnv("MEDIA_CEILING_USD_PER_ORG_MONTH", "");
});

describe("createMediaJob and the spending ceiling", () => {
  it("enqueues when the estimate is under the ceiling", async () => {
    vi.stubEnv("MEDIA_CEILING_USD_PER_JOB", "0.50");
    const result = await createMediaJob(input(4));

    expect(result).toMatchObject({ mediaJobId: "mj1", modelKey: "mock-image" });
    expect(state.inserted).toHaveLength(1);
    expect(state.emitted).toEqual([{ name: "media.generate", p: { mediaJobId: "mj1" } }]);
    expect(state.audited).toHaveLength(1);
  });

  it("refuses a job over the per-job ceiling, and writes nothing at all", async () => {
    vi.stubEnv("MEDIA_CEILING_USD_PER_JOB", "0.10");
    // 4 images at $0.05 = $0.20.
    const result = await createMediaJob(input(4));

    expect(result).toEqual({ error: "That would cost about $0.20, above the $0.10 limit for a single generation." });
    wroteNothing();
  });

  it("refuses rather than guessing when the routed model has no configured rate", async () => {
    vi.stubEnv("AI_MEDIA_RATES_JSON", "{}");
    vi.stubEnv("MEDIA_CEILING_USD_PER_JOB", "0.50");
    const result = await createMediaJob(input(1));

    expect(result).toEqual({ error: expect.stringContaining("no configured rate") });
    wroteNothing();
  });

  it("refuses when the month's spend would pass the organization ceiling", async () => {
    vi.stubEnv("MEDIA_CEILING_USD_PER_ORG_MONTH", "25.00");
    state.spentThisMonth = "24.90";
    const result = await createMediaJob(input(4));

    expect(result).toEqual({ error: "This month's generation limit of $25.00 is nearly used — $0.10 remains and this would cost about $0.20." });
    wroteNothing();
  });

  it("does not refuse an unpriceable job when no ceiling is configured", async () => {
    vi.stubEnv("AI_MEDIA_RATES_JSON", "{}");
    const result = await createMediaJob(input(1));

    expect(result).toMatchObject({ mediaJobId: "mj1" });
  });

  it("ignores a malformed ceiling rather than reading it as zero", async () => {
    vi.stubEnv("MEDIA_CEILING_USD_PER_JOB", "fifty cents");
    const result = await createMediaJob(input(4));

    expect(result).toMatchObject({ mediaJobId: "mj1" });
  });
});

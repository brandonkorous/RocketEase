/*
 * What a finished image actually COST, as opposed to what it was estimated at.
 *
 * Azure prices gpt-image-2 per token and publishes no per-image meter, so the
 * estimate is a deployment's rounded guess while this is the bill. The rule
 * under test is that an unknown cost stays undefined: a job with no reported
 * usage must not read as free, because the monthly ceiling accrues against it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelByKey } from "../catalog";
import type { GenerationSpec } from "../types";
import { __resetOpenAiJobs, azureOpenAiAdapter, openaiAdapter } from "./index";

const azureModel = () => modelByKey("azure-gpt-image-2")!;
const directModel = () => modelByKey("gpt-image-2")!;
const spec: GenerationSpec = { jobKind: "scene_still", prompt: "a quiet street", aspect: "1:1", count: 1 };

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** A reply shaped like the live one, whose usage block is what gets billed. */
const replyWith = (usage?: Record<string, number>) => ({
  ok: true,
  status: 200,
  json: async () => ({ data: [{ b64_json: PNG_B64 }], ...(usage ? { usage } : {}) }),
});

const stub = (reply: unknown) => vi.stubGlobal("fetch", vi.fn(async () => reply));

/** Start and poll one job, returning the state the worker would record. */
async function run(adapter: ReturnType<typeof azureOpenAiAdapter>, model: ReturnType<typeof azureModel>) {
  const handle = await adapter.start(model, spec, "k1");
  return adapter.poll(handle);
}

describe("cost from reported usage", () => {
  beforeEach(() => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://x.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "key";
    process.env.AZURE_OPENAI_API_VERSION = "2025-04-01-preview";
    process.env.OPENAI_API_KEY = "sk-test";
    __resetOpenAiJobs();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("prices a job from the tokens the vendor says it billed", async () => {
    // The busiest image measured against the live deployment on 2026-08-31.
    stub(replyWith({ input_tokens: 29, output_tokens: 1331 }));
    const state = await run(azureOpenAiAdapter(), azureModel());
    // 29 * $5/1M + 1331 * $30/1M
    expect(state.usage?.costUsd).toBeCloseTo(0.040075, 6);
  });

  it("prices the trivial case too, rather than rounding it away to zero", async () => {
    stub(replyWith({ input_tokens: 15, output_tokens: 148 }));
    const state = await run(azureOpenAiAdapter(), azureModel());
    expect(state.usage?.costUsd).toBeCloseTo(0.004515, 6);
  });

  it("leaves the cost UNKNOWN when the vendor reports no usage", async () => {
    // An older api-version omits the block. Unknown must not become 0, or the
    // monthly ceiling would accrue nothing and never refuse anything.
    stub(replyWith());
    const state = await run(azureOpenAiAdapter(), azureModel());
    expect(state.usage?.costUsd).toBeUndefined();
  });

  it("leaves the cost unknown on a half-reported usage block", async () => {
    stub(replyWith({ output_tokens: 1331 }));
    const state = await run(azureOpenAiAdapter(), azureModel());
    expect(state.usage?.costUsd).toBeUndefined();
  });

  it("does not price the DIRECT model, whose rates nobody has verified", async () => {
    // Same weights, a different price list. Guessing OpenAI's rate from Azure's
    // would be inventing a number, so the cost stays unknown.
    stub(replyWith({ input_tokens: 29, output_tokens: 1331 }));
    const state = await run(openaiAdapter(), directModel());
    expect(state.usage?.costUsd).toBeUndefined();
  });

  it("still reports the quantity, so an unpriced job is not an empty one", async () => {
    stub(replyWith());
    const state = await run(azureOpenAiAdapter(), azureModel());
    expect(state.usage).toMatchObject({ quantity: 1, unit: "images" });
  });
});

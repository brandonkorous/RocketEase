import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { aiCapMessage, budgetFrom, readAiLimits } from "./budget";
import type { Prompt } from "../prompts";

/* generate() is the backstop: the cap is enforced in the client, not only in the UI. */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ create: vi.fn(), checkAiBudget: vi.fn(), recordAiUsage: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: h.create }; } }));
vi.mock("./meter", async () => {
  const budget = await import("./budget");
  return { checkAiBudget: h.checkAiBudget, aiCapMessage: budget.aiCapMessage };
});
vi.mock("./record", () => ({ recordAiUsage: h.recordAiUsage }));

const prompt: Prompt = { system: "sys", user: "usr", maxTokens: 100 };
const meta = { organizationId: "org1", workspaceId: "ws1", userId: "u1", kind: "caption" as const };
const resetsAt = new Date("2026-09-01T07:00:00Z");
const timezone = "America/Los_Angeles";
const budget = (used: number) => budgetFrom({ used, limits: readAiLimits({}), resetsAt, timezone });
const load = () => import("../client");

beforeEach(() => {
  vi.resetModules();
  h.create.mockReset();
  h.checkAiBudget.mockReset();
  h.recordAiUsage.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.AI_MODEL;
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("at the monthly cap", () => {
  beforeEach(() => h.checkAiBudget.mockResolvedValue(budget(600)));

  test("generate refuses with the reset date and never calls the model", async () => {
    const { generate, isBudgetExceeded } = await load();
    const res = await generate(prompt, meta);
    expect(res).toEqual({ error: aiCapMessage(resetsAt, timezone), code: "budget_exceeded" });
    expect(isBudgetExceeded(res)).toBe(true);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.recordAiUsage).not.toHaveBeenCalled();
  });

  test("a drafting action surfaces the refusal as { error }", async () => {
    const { aiGenerator } = await load();
    const res = await aiGenerator(meta)(prompt);
    expect("error" in res && res.error).toContain("Credits reset on September 1, 2026.");
  });
});

describe("under the cap", () => {
  beforeEach(() => h.checkAiBudget.mockResolvedValue(budget(10)));

  test("the completion runs and one ledger row is written for it", async () => {
    h.create.mockResolvedValue({ id: "msg_1", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 200, output_tokens: 1_000 } });
    const { generate, DEFAULT_AI_MODEL } = await load();
    expect(await generate(prompt, meta)).toEqual({ text: "hi" });
    expect(h.recordAiUsage).toHaveBeenCalledWith({ ...meta, model: DEFAULT_AI_MODEL, inputTokens: 200, outputTokens: 1_000, requestId: "msg_1" });
  });

  test("usage is recorded even when the completion comes back empty", async () => {
    h.create.mockResolvedValue({ content: [], usage: { input_tokens: 50, output_tokens: 0 } });
    const { AI_EMPTY, generate } = await load();
    expect(await generate(prompt, meta)).toEqual({ error: AI_EMPTY });
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
  });
});

describe("without a usage context", () => {
  test("nothing is checked or metered — unmetered callers are unchanged", async () => {
    h.create.mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
    const { generate } = await load();
    expect(await generate(prompt)).toEqual({ text: "hi" });
    expect(h.checkAiBudget).not.toHaveBeenCalled();
    expect(h.recordAiUsage).not.toHaveBeenCalled();
  });
});

describe("when the budget cannot be read", () => {
  test("drafting continues rather than breaking on an infrastructure blip", async () => {
    h.checkAiBudget.mockRejectedValue(new Error("db down"));
    h.create.mockResolvedValue({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 1 } });
    const { generate } = await load();
    expect(await generate(prompt, meta)).toEqual({ text: "hi" });
  });
});

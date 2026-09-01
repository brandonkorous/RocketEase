import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL } from "./messages";
import type { Prompt } from "./prompts";

vi.mock("server-only", () => ({}));

const create = vi.fn();
const construct = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
    constructor(opts: unknown) { construct(opts); }
  },
}));

const prompt: Prompt = { system: "sys", user: "usr", maxTokens: 100 };
const load = async () => import("./client");

// Azure OpenAI OUTRANKS Anthropic when configured, so an ambient text
// deployment would quietly route these cases to the wrong vendor and let the
// suite pass while asserting nothing about Anthropic at all.
const AZURE_TEXT = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_TEXT_DEPLOYMENT", "AZURE_OPENAI_TEXT_API_VERSION"];
const clearEnv = () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.ANTHROPIC_BASE_URL;
  AZURE_TEXT.forEach((k) => delete process.env[k]);
};

beforeEach(() => {
  vi.resetModules();
  create.mockReset();
  construct.mockReset();
  clearEnv();
});
afterEach(clearEnv);

describe("with no ANTHROPIC_API_KEY", () => {
  test("the feature reports itself unconfigured", async () => {
    const { aiConfigured } = await load();
    expect(aiConfigured()).toBe(false);
  });

  test("generate declines with the configuration message and never builds a client", async () => {
    const { generate } = await load();
    expect(await generate(prompt)).toEqual({ error: AI_UNCONFIGURED });
    expect(construct).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("with a key configured", () => {
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "test-key"; });

  test("sends the prompt and returns the text blocks joined", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: " hello " }, { type: "thinking", thinking: "x" }], usage: { output_tokens: 3 } });
    const { generate } = await load();
    expect(await generate(prompt)).toEqual({ text: "hello" });
    expect(create).toHaveBeenCalledWith({ model: DEFAULT_AI_MODEL, max_tokens: 100, system: "sys", messages: [{ role: "user", content: "usr" }] });
  });

  test("AI_MODEL overrides the default model id", async () => {
    process.env.AI_MODEL = "claude-opus-5";
    create.mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
    const { aiModel, generate } = await load();
    await generate(prompt);
    expect(aiModel()).toBe("claude-opus-5");
    expect(create.mock.calls[0][0].model).toBe("claude-opus-5");
  });

  test("an empty completion is an error, not an empty draft", async () => {
    create.mockResolvedValue({ content: [] });
    const { generate, AI_EMPTY } = await load();
    expect(await generate(prompt)).toEqual({ error: AI_EMPTY });
  });

  test("a provider failure becomes a message, never a thrown error", async () => {
    create.mockRejectedValue(new Error("429"));
    const { generate } = await load();
    expect(await generate(prompt)).toEqual({ error: AI_UNAVAILABLE });
  });

  test("the key reaches the SDK and nothing else", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
    const { generate } = await load();
    const res = await generate(prompt);
    expect(construct).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(JSON.stringify(res)).not.toContain("test-key");
  });
});

describe("Microsoft Foundry", () => {
  test("points the SDK at the Foundry data plane when one is configured", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.ANTHROPIC_BASE_URL = "https://ai-rocketease-prod-eus2.services.ai.azure.com/anthropic";
    const { generate } = await load();
    create.mockResolvedValue({ content: [{ type: "text", text: "hi" }], usage: {} });
    await generate(prompt);
    expect(construct).toHaveBeenCalledWith({ apiKey: "k", baseURL: "https://ai-rocketease-prod-eus2.services.ai.azure.com/anthropic" });
  });

  test("goes direct to Anthropic when no base URL is set", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const { generate } = await load();
    create.mockResolvedValue({ content: [{ type: "text", text: "hi" }], usage: {} });
    await generate(prompt);
    expect(construct).toHaveBeenCalledWith({ apiKey: "k", baseURL: undefined });
  });

  test("rebuilds the client when the key rotates, rather than holding the old one", async () => {
    process.env.ANTHROPIC_API_KEY = "old";
    const { generate } = await load();
    create.mockResolvedValue({ content: [{ type: "text", text: "hi" }], usage: {} });
    await generate(prompt);
    process.env.ANTHROPIC_API_KEY = "new";
    await generate(prompt);
    expect(construct).toHaveBeenCalledTimes(2);
    expect(construct).toHaveBeenLastCalledWith({ apiKey: "new", baseURL: undefined });
  });
});

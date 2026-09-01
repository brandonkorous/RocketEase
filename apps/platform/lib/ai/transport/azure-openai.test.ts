/*
 * The wire format, pinned against what a live call actually accepted on
 * 2026-08-31. The headline case is max_completion_tokens: gpt-5.x REJECTS
 * max_tokens outright, so a transport written from Claude's shape returns a 400
 * on every draft.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "../prompts";
import { azureOpenAiTextTransport } from "./azure-openai";

const prompt: Prompt = { system: "sys", user: "usr", maxTokens: 1200 };

let calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];

const reply = (over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    id: "chatcmpl-1",
    choices: [{ finish_reason: "stop", message: { content: " drafted " } }],
    usage: { prompt_tokens: 30, completion_tokens: 87 },
    ...over,
  }),
});

function stub(r: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return r;
  }));
}

beforeEach(() => {
  calls = [];
  process.env.AZURE_OPENAI_ENDPOINT = "https://x.openai.azure.com/";
  process.env.AZURE_OPENAI_API_KEY = "key";
  process.env.AZURE_OPENAI_TEXT_DEPLOYMENT = "rocketease-text";
  process.env.AZURE_OPENAI_TEXT_API_VERSION = "2024-10-21";
});
afterEach(() => vi.unstubAllGlobals());

describe("azure openai text transport", () => {
  it("sends max_completion_tokens and NEVER max_tokens", async () => {
    stub(reply());
    await azureOpenAiTextTransport().complete(prompt);
    expect(calls[0].body.max_completion_tokens).toBe(1200);
    expect(calls[0].body).not.toHaveProperty("max_tokens");
  });

  it("posts to the deployment path with the text api-version", async () => {
    stub(reply());
    await azureOpenAiTextTransport().complete(prompt);
    expect(calls[0].url).toBe("https://x.openai.azure.com/openai/deployments/rocketease-text/chat/completions?api-version=2024-10-21");
  });

  it("strips the trailing slash — the classic Azure 404", async () => {
    stub(reply());
    await azureOpenAiTextTransport().complete(prompt);
    expect(calls[0].url).not.toContain(".com//openai");
  });

  it("authenticates with api-key, NOT a bearer token", async () => {
    stub(reply());
    await azureOpenAiTextTransport().complete(prompt);
    expect(calls[0].headers["api-key"]).toBe("key");
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it("carries the system prompt as a system message", async () => {
    stub(reply());
    await azureOpenAiTextTransport().complete(prompt);
    expect(calls[0].body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("returns the vendor's REAL token counts, because the ledger bills on them", async () => {
    stub(reply());
    const res = await azureOpenAiTextTransport().complete(prompt);
    expect(res).toMatchObject({ text: "drafted", inputTokens: 30, outputTokens: 87, requestId: "chatcmpl-1" });
  });

  it("reports a budget spent entirely before any text, rather than returning nothing", async () => {
    stub(reply({ choices: [{ finish_reason: "length", message: { content: "" } }] }));
    await expect(azureOpenAiTextTransport().complete(prompt)).rejects.toThrow(/truncated/i);
  });

  it("keeps a truncated but non-empty draft — a partial draft is still editable", async () => {
    stub(reply({ choices: [{ finish_reason: "length", message: { content: "half a dr" } }] }));
    expect((await azureOpenAiTextTransport().complete(prompt)).text).toBe("half a dr");
  });

  it("throws on a vendor error rather than returning an empty draft", async () => {
    stub({ ok: false, status: 429, json: async () => ({ error: { code: "429" } }) });
    await expect(azureOpenAiTextTransport().complete(prompt)).rejects.toThrow(/azure-openai 429/);
  });
});

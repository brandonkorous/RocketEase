/*
 * Which vendor answers, decided from configuration alone.
 *
 * This is the test that would have caught the original problem: drafting was
 * welded to one SDK, so "use a different model" was a rewrite rather than a
 * setting. Selection is now data, and these pin the precedence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: vi.fn() }; } }));

const AZURE = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_TEXT_DEPLOYMENT", "AZURE_OPENAI_TEXT_API_VERSION"];
const ALL = [...AZURE, "ANTHROPIC_API_KEY", "AI_MODEL", "ANTHROPIC_BASE_URL"];

const clear = () => ALL.forEach((k) => delete process.env[k]);

const azureConfigured = () => {
  process.env.AZURE_OPENAI_ENDPOINT = "https://x.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "key";
  process.env.AZURE_OPENAI_TEXT_DEPLOYMENT = "rocketease-text";
  process.env.AZURE_OPENAI_TEXT_API_VERSION = "2024-10-21";
};

const load = () => import("./index");

beforeEach(() => {
  vi.resetModules();
  clear();
});
afterEach(clear);

describe("transport selection", () => {
  it("is null when nothing is configured, which is a real state", async () => {
    expect((await load()).activeTransport()).toBeNull();
  });

  it("uses Anthropic when only its key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect((await load()).activeTransport()?.name).toBe("anthropic");
  });

  it("uses Azure OpenAI when only it is configured", async () => {
    azureConfigured();
    expect((await load()).activeTransport()?.name).toBe("azure-openai");
  });

  it("prefers Azure when both are set — a deployment name is the deliberate one", async () => {
    // A leftover ANTHROPIC_API_KEY must not quietly outrank a deployment that
    // Terraform only writes when the deployment actually exists.
    azureConfigured();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect((await load()).activeTransport()?.name).toBe("azure-openai");
  });

  it("does NOT use a half-configured Azure — a guessed api-version is a 400", async () => {
    azureConfigured();
    delete process.env.AZURE_OPENAI_TEXT_API_VERSION;
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect((await load()).activeTransport()?.name).toBe("anthropic");
  });

  it("ignores the IMAGE deployment — text needs its own", async () => {
    azureConfigured();
    delete process.env.AZURE_OPENAI_TEXT_DEPLOYMENT;
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = "rocketease-images";
    expect((await load()).activeTransport()).toBeNull();
    delete process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT;
  });

  it("records the DEPLOYMENT name on Azure, not the model id", async () => {
    azureConfigured();
    expect((await load()).activeTransport()?.model()).toBe("rocketease-text");
  });

  it("records the model id on Anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.AI_MODEL = "claude-opus-5";
    expect((await load()).activeTransport()?.model()).toBe("claude-opus-5");
  });
});

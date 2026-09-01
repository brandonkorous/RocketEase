/*
 * GPT on our own Azure OpenAI account - the same resource that serves image
 * generation, so one account, one key, one endpoint, one subprocessor.
 *
 * Unlike images, text gets DataZoneStandard: inference stays inside the United
 * States. That matters more here than it does for a picture, because a drafting
 * prompt carries the brand voice, the strategy, and whatever the customer
 * pasted into the brief.
 */
import type { Prompt } from "../prompts";
import type { Completion, TextTransport } from "./types";

const TIMEOUT_MS = 120_000;

/** Trailing slashes on the endpoint are the classic Azure 404. */
const endpoint = () => (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
const deployment = () => process.env.AZURE_OPENAI_TEXT_DEPLOYMENT ?? "";

/**
 * NO DEFAULT, and separate from the images api-version. Azure changes behaviour
 * across versions, and the two data planes move independently - pinning them
 * together means an images upgrade silently changes what drafting sends.
 */
const apiVersion = () => process.env.AZURE_OPENAI_TEXT_API_VERSION ?? "";

export const azureOpenAiTextConfigured = () =>
  Boolean(endpoint() && process.env.AZURE_OPENAI_API_KEY && deployment() && apiVersion());

type Reply = {
  id?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: string; message?: string };
};

const url = () => `${endpoint()}/openai/deployments/${deployment()}/chat/completions?api-version=${apiVersion()}`;

async function post(prompt: Prompt): Promise<Reply> {
  const res = await fetch(url(), {
    method: "POST",
    headers: { "api-key": process.env.AZURE_OPENAI_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      // NOT `max_tokens`. gpt-5.x rejects it outright:
      //   "Unsupported parameter: 'max_tokens' is not supported with this
      //    model. Use 'max_completion_tokens' instead."
      // Confirmed against this deployment on 2026-08-31, not read off a page.
      max_completion_tokens: prompt.maxTokens,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as Reply | null;
  if (!res.ok) throw new Error(`azure-openai ${res.status}: ${body?.error?.code ?? "unknown"}`);
  if (!body) throw new Error("azure-openai returned no body");
  return body;
}

export const azureOpenAiTextTransport = (): TextTransport => ({
  name: "azure-openai",
  // The DEPLOYMENT name, which is what addresses the model and what the ledger
  // should read back. The model id lives in the Terraform that pinned it.
  model: deployment,
  async complete(prompt: Prompt): Promise<Completion> {
    const body = await post(prompt);
    const choice = body.choices?.[0];
    const text = (choice?.message?.content ?? "").trim();
    // A budget spent entirely on reasoning returns nothing and stops on
    // `length`. Saying so beats handing back an empty draft as if it were one.
    if (!text && choice?.finish_reason === "length") {
      throw new Error("azure-openai truncated the reply before any text was produced");
    }
    return {
      text,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
      requestId: body.id ?? null,
    };
  },
});

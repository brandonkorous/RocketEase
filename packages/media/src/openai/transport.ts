/*
 * The images HTTP call, shared by OpenAI direct and Azure OpenAI.
 *
 * The two differ in exactly three places — the URL, the auth header, and
 * whether the model rides in the path or the body — so they share everything
 * else. Two copies would drift on error mapping, which is the part that decides
 * whether the worker re-spends money.
 */
import type { ModelDescriptor } from "../io";
import { MediaError, type GenerationSpec, type RawOutput } from "../types";
import { sizeFor } from "./models";

export const TIMEOUT_MS = 120_000;

/** What the vendor says it billed. Absent on older api-versions, so never assumed. */
export type ImagesUsage = { inputTokens: number; outputTokens: number };

export type ImagesReply = {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string; type?: string };
};

/** Bytes, plus what they cost in the only unit the vendor reports. */
export type ImagesResult = { outputs: RawOutput[]; usage: ImagesUsage | null };

/** Reported usage, or null. A partial reply is null rather than a half-counted bill. */
function usageFrom(reply: ImagesReply | null): ImagesUsage | null {
  const u = reply?.usage;
  if (!u || typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") return null;
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens };
}

/** Where to post, how to authenticate, and what the body must carry. */
export type Transport = {
  url: (model: ModelDescriptor) => string;
  headers: () => Record<string, string>;
  /** Azure names the model in the URL path, so it is absent from the body. */
  modelInBody: boolean;
};

/** Everything that can go wrong with one call, mapped to a category. */
export function errorFor(status: number, body: ImagesReply | null): MediaError {
  const code = body?.error?.code ?? body?.error?.type;
  const message = body?.error?.message ?? `The image endpoint returned ${status}.`;
  if (status === 401 || status === 403) return new MediaError("The image API key was rejected.", { category: "permission", vendorCode: code });
  if (status === 404) return new MediaError("No such image deployment. Check the deployment name matches the model.", { category: "validation", vendorCode: code });
  if (status === 429) return new MediaError("The image endpoint is rate limiting us.", { category: "rate_limit", vendorCode: code });
  // Azure returns content_filter; OpenAI returns a moderation-shaped message.
  if (status === 400 && /policy|moderation|safety|content_filter/i.test(`${code} ${message}`)) {
    return new MediaError("The prompt was refused on content-policy grounds.", { category: "policy", retryable: false, vendorCode: code });
  }
  if (status === 400) return new MediaError(message, { category: "validation", vendorCode: code });
  // 5xx: the request may well have been billed, so it is ambiguous, not just temporary.
  return new MediaError("The image request didn't complete.", { category: "temporary", ambiguous: true, vendorCode: code });
}

export async function requestImages(t: Transport, model: ModelDescriptor, spec: GenerationSpec, count: number): Promise<ImagesResult> {
  // Per MODEL, not per adapter: gpt-image-1 takes three fixed sizes, gpt-image-2
  // takes arbitrary ones and we ask for the placement's own resolution.
  const size = sizeFor(model, spec.aspect);
  // Routing should have caught this; refusing here costs nothing and a silently
  // squared portrait is worse than a refusal.
  if (!size) throw new MediaError(`This model doesn't render ${spec.aspect}.`, { category: "validation", retryable: false });

  const body: Record<string, unknown> = { prompt: spec.prompt, n: count, size };
  if (t.modelInBody) body.model = model.vendorModelId;

  let res: Response;
  try {
    res = await fetch(t.url(model), {
      method: "POST",
      headers: { ...t.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    // We never learned whether it ran. That is the ambiguous case by definition.
    throw new MediaError("The image request didn't complete.", { category: "temporary", ambiguous: true, cause });
  }

  const reply = (await res.json().catch(() => null)) as ImagesReply | null;
  if (!res.ok) throw errorFor(res.status, reply);

  const outputs = (reply?.data ?? []).flatMap<RawOutput>((d) =>
    d.b64_json ? [{ bytes: Buffer.from(d.b64_json, "base64"), claimedMimeType: "image/png" }] : [],
  );
  if (!outputs.length) throw new MediaError("The image endpoint returned no image.", { category: "unknown", retryable: false });
  return { outputs, usage: usageFrom(reply) };
}

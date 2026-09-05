/*
 * The fal.ai queue calls. Contract read off fal's queue documentation on
 * 2026-09-01 (fal.ai/docs/documentation/model-apis/inference/queue.md):
 *
 *   POST https://queue.fal.run/{model-id}            submit (input at top level)
 *   GET  {status_url}                                IN_QUEUE | IN_PROGRESS | COMPLETED
 *   GET  {response_url}                              the payload, once COMPLETED
 *
 * The docs' own advice for pathed model ids is to USE THE URLS THE SUBMIT
 * RESPONSE RETURNS rather than construct them — which is why the adapter
 * carries status_url/response_url in the handle's meta and the platform
 * persists it (media_job.remote_meta). Construction survives only as a
 * fallback for a row written before that column existed.
 */
import { MediaError } from "../types";

export const TIMEOUT_MS = 60_000;

export type FalConfig = { key: string };

export type FalQueued = { request_id?: string; status_url?: string; response_url?: string; cancel_url?: string };
export type FalStatus = { status?: string; queue_position?: number };

const auth = (c: FalConfig) => ({ Authorization: `Key ${c.key}`, "Content-Type": "application/json" });

/** fal's error body is `detail`: a string, or an array of { msg } validation items. */
export function detailFrom(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => (d && typeof d === "object" ? (d as { msg?: string }).msg : undefined)).filter(Boolean);
    if (msgs.length > 0) return msgs.join("; ");
  }
  return undefined;
}

export function errorFor(status: number, body: unknown): MediaError {
  const message = detailFrom(body) ?? `The fal endpoint returned ${status}.`;
  if (status === 401 || status === 403) return new MediaError("The fal API key was rejected.", { category: "permission" });
  if (status === 404) return new MediaError(message, { category: "validation" });
  // 422 is fal's schema refusal — the request never became a job.
  if (status === 400 || status === 422) return new MediaError(message, { category: "validation" });
  if (status === 429) return new MediaError("fal is rate-limiting this model — try again in a minute.", { category: "rate_limit" });
  // 5xx after a POST is the dangerous one: the job may exist and be billing.
  if (status >= 500) return new MediaError("fal failed while handling the request.", { category: "temporary", ambiguous: true });
  return new MediaError(message, { category: "unknown" });
}

async function call<T>(c: FalConfig, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: auth(c), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) throw errorFor(res.status, body);
  if (!body) throw new MediaError("The fal endpoint returned no body.", { category: "unknown" });
  return body;
}

/** Submit. The input rides at the TOP LEVEL of the body, not under `input`. */
export async function submit(c: FalConfig, vendorModelId: string, input: Record<string, unknown>): Promise<FalQueued> {
  return call<FalQueued>(c, `https://queue.fal.run/${vendorModelId}`, { method: "POST", body: JSON.stringify(input) });
}

export async function readStatus(c: FalConfig, statusUrl: string): Promise<FalStatus> {
  return call<FalStatus>(c, statusUrl, { method: "GET" });
}

/**
 * The completed payload. Thrown MediaErrors here carry a real verdict: a 4xx
 * from the response endpoint of a COMPLETED request is the generation's own
 * failure (content policy, invalid input discovered late), not a transport
 * hiccup — the caller turns non-retryable categories into a failed job state.
 */
export async function readResponse(c: FalConfig, responseUrl: string): Promise<unknown> {
  return call<unknown>(c, responseUrl, { method: "GET" });
}

/** Output bytes. fal CDN URLs are self-authorizing; no key header is sent. */
export async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    // The job was billed whether or not we collect it, so a miss here must
    // never read as "never happened".
    if (res.status === 404) throw new MediaError("The generated file could not be downloaded — it may be past its retention window.", { category: "temporary" });
    throw errorFor(res.status, null);
  }
  return new Uint8Array(await res.arrayBuffer());
}

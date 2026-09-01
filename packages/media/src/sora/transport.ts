/*
 * The Sora 2 HTTP calls. Three of them, and they are NOT the images data plane:
 *
 *   POST /openai/v1/video/generations/jobs              create
 *   GET  /openai/v1/video/generations/jobs/{id}         poll
 *   GET  /openai/v1/video/generations/{gid}/content/video   download
 *
 * The api-version is the literal string "preview", not a date. The model rides
 * in the BODY. Both differ from images, which is why this is its own module
 * rather than a flag on the other one.
 */
import { MediaError } from "../types";

export const TIMEOUT_MS = 60_000;

export type SoraConfig = { endpoint: string; apiKey: string; deployment: string; apiVersion: string };

/** Exactly the fields the job response documents. No `usage` — there is none. */
export type SoraJob = {
  id?: string;
  status?: string;
  n_seconds?: number | string;
  n_variants?: number | string;
  height?: number | string;
  width?: number | string;
  finished_at?: number | null;
  expires_at?: number | null;
  generations?: { id?: string }[];
  failure_reason?: string | null;
  error?: { message?: string; code?: string };
};

const base = (c: SoraConfig) => `${c.endpoint.replace(/\/+$/, "")}/openai/v1/video/generations`;
const auth = (c: SoraConfig) => ({ "api-key": c.apiKey, "Content-Type": "application/json" });

export function errorFor(status: number, body: SoraJob | null): MediaError {
  const code = body?.error?.code;
  const message = body?.error?.message ?? `The video endpoint returned ${status}.`;
  if (status === 401 || status === 403) return new MediaError("The video API key was rejected.", { category: "permission", vendorCode: code });
  if (status === 404) return new MediaError("No such video deployment. Check the deployment name matches the model.", { category: "validation", vendorCode: code });
  if (status === 429) return new MediaError("The video model is busy — try again in a minute.", { category: "rate_limit", vendorCode: code });
  if (status === 400) return new MediaError(message, { category: "validation", vendorCode: code });
  // 5xx after a POST is the dangerous one: the job may exist and be billing.
  if (status >= 500) return new MediaError("The video service failed while starting the job.", { category: "temporary", ambiguous: true, vendorCode: code });
  return new MediaError(message, { category: "unknown", vendorCode: code });
}

async function call(url: string, init: RequestInit): Promise<SoraJob> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as SoraJob | null;
  if (!res.ok) throw errorFor(res.status, body);
  if (!body) throw new MediaError("The video endpoint returned no body.", { category: "unknown" });
  return body;
}

export async function createJob(c: SoraConfig, body: { prompt: string; width: number; height: number; seconds: number }): Promise<SoraJob> {
  return call(`${base(c)}/jobs?api-version=${c.apiVersion}`, {
    method: "POST",
    headers: auth(c),
    // `model` is the DEPLOYMENT name here, which is how this API names it.
    body: JSON.stringify({ model: c.deployment, prompt: body.prompt, width: body.width, height: body.height, n_seconds: body.seconds }),
  });
}

export async function readJob(c: SoraConfig, jobId: string): Promise<SoraJob> {
  return call(`${base(c)}/jobs/${encodeURIComponent(jobId)}?api-version=${c.apiVersion}`, { method: "GET", headers: auth(c) });
}

/** The MP4 itself. Times out against the same clock, but the URL dies in ~1h. */
export async function downloadVideo(c: SoraConfig, generationId: string): Promise<Uint8Array> {
  const url = `${base(c)}/${encodeURIComponent(generationId)}/content/video?api-version=${c.apiVersion}`;
  const res = await fetch(url, { headers: { "api-key": c.apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    // Past the TTL this is a 404, and it means the bytes are gone for good —
    // the job was still billed, so this must not read as "never happened".
    if (res.status === 404) throw new MediaError("The generated video expired before it could be downloaded.", { category: "temporary" });
    throw errorFor(res.status, null);
  }
  return new Uint8Array(await res.arrayBuffer());
}

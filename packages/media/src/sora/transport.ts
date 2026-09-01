/*
 * The Sora 2 HTTP calls. Three of them, and they are NOT the images data plane:
 *
 *   POST /openai/v1/videos              create
 *   GET  /openai/v1/videos/{id}         poll
 *   GET  /openai/v1/videos/{id}/content download
 *
 * This is the OpenAI-compatible Videos API, reached through Azure's endpoint.
 * It is NOT the `/video/generations/jobs` shape Azure's own docs describe for
 * sora — that path answers 404 on this account (docs/bugs/B-006). The
 * api-version is the literal string "preview"; the model rides in the BODY;
 * `seconds` is a STRING; `size` is one field, not width and height.
 */
import { MediaError } from "../types";

export const TIMEOUT_MS = 60_000;

export type SoraConfig = { endpoint: string; apiKey: string; deployment: string; apiVersion: string };

/** Exactly the fields the video object documents. No `usage` — there is none. */
export type SoraJob = {
  id?: string;
  status?: string;
  progress?: number;
  seconds?: string | number;
  size?: string;
  created_at?: number | null;
  completed_at?: number | null;
  expires_at?: number | null;
  error?: { message?: string; code?: string | null } | null;
};

const base = (c: SoraConfig) => `${c.endpoint.replace(/\/+$/, "")}/openai/v1/videos`;
const auth = (c: SoraConfig) => ({ "api-key": c.apiKey, "Content-Type": "application/json" });

export function errorFor(status: number, body: SoraJob | null): MediaError {
  const code = body?.error?.code ?? undefined;
  const message = body?.error?.message ?? `The video endpoint returned ${status}.`;
  if (status === 401 || status === 403) return new MediaError("The video API key was rejected.", { category: "permission", vendorCode: code });
  // Only DeploymentNotFound is actually about the deployment. Any other 404
  // is a wrong path or a job that is gone, and saying "deployment" there sends
  // the reader to check a name that was never wrong.
  if (status === 404) {
    const deployment = code === "DeploymentNotFound";
    return new MediaError(deployment ? "No such video deployment. Check the deployment name matches the model." : message, { category: "validation", vendorCode: code });
  }
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

export type CreateBody = { prompt: string; size: string; seconds: number; reference?: { bytes: Uint8Array; mimeType: string } };

/**
 * JSON when there is no reference image, multipart when there is.
 *
 * Not a stylistic choice: `input_reference` is a file part, and sending the
 * same request as JSON with a base64 string is rejected. The Content-Type
 * header is omitted for multipart deliberately — fetch writes it itself, with
 * the boundary, and setting it by hand produces a body the server cannot parse.
 */
export async function createJob(c: SoraConfig, body: CreateBody): Promise<SoraJob> {
  const url = `${base(c)}?api-version=${c.apiVersion}`;
  const seconds = String(body.seconds);

  if (!body.reference) {
    return call(url, {
      method: "POST",
      headers: auth(c),
      // `model` is the DEPLOYMENT name here, and `seconds` is a string: 4 is a
      // 400 ("Invalid value"), "4" is accepted.
      body: JSON.stringify({ model: c.deployment, prompt: body.prompt, size: body.size, seconds }),
    });
  }

  const form = new FormData();
  form.set("model", c.deployment);
  form.set("prompt", body.prompt);
  form.set("size", body.size);
  form.set("seconds", seconds);
  form.set("input_reference", new Blob([body.reference.bytes as BlobPart], { type: body.reference.mimeType }), "reference");
  return call(url, { method: "POST", headers: { "api-key": c.apiKey }, body: form });
}

export async function readJob(c: SoraConfig, jobId: string): Promise<SoraJob> {
  return call(`${base(c)}/${encodeURIComponent(jobId)}?api-version=${c.apiVersion}`, { method: "GET", headers: auth(c) });
}

/** The MP4 itself. The video id IS the download id — there is no separate one. */
export async function downloadVideo(c: SoraConfig, videoId: string): Promise<Uint8Array> {
  const url = `${base(c)}/${encodeURIComponent(videoId)}/content?api-version=${c.apiVersion}`;
  const res = await fetch(url, { headers: { "api-key": c.apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    // A 404 here is "not ready" or "past its TTL". Either way the job was
    // billed, so this must not read as "never happened".
    if (res.status === 404) throw new MediaError("The generated video could not be downloaded — it is either not finished or past its expiry.", { category: "temporary" });
    throw errorFor(res.status, null);
  }
  return new Uint8Array(await res.arrayBuffer());
}

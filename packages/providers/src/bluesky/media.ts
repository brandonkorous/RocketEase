/*
 * Bluesky blobs. Images go to the account's PDS through
 * com.atproto.repo.uploadBlob as raw bytes. Video goes to Bluesky's video
 * service with a service-auth token the PDS mints for exactly that upload;
 * the service transcodes asynchronously and getJobStatus is polled until a
 * blob exists — or the job fails, which is reported, never assumed.
 */
import type { MediaInput } from "../types";
import { ProviderError } from "../types";
import { httpJson } from "../http";
import { LIMITS, VIDEO_SERVICE, mapAtError, query, xrpc, type AtError } from "./client";

export type Blob = { $type: "blob"; ref: { $link: string }; mimeType: string; size: number };
export type Sleep = (ms: number) => Promise<void>;
export type Ctx = { service: string; token: string; did: string };

type JobStatus = { jobId?: string; state?: string; progress?: number; blob?: Blob; error?: string; message?: string };
type DidDoc = { service?: { id?: string; type?: string; serviceEndpoint?: string }[] };

export const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url).catch((e) => {
    throw new ProviderError("Could not download the media to upload it to Bluesky", { category: "temporary", cause: e });
  });
  if (!res.ok) throw new ProviderError(`Could not download the media to upload it to Bluesky (${res.status})`, { category: "temporary" });
  return new Uint8Array(await res.arrayBuffer());
}

export async function uploadImage(ctx: Ctx, media: MediaInput): Promise<Blob> {
  const bytes = await fetchBytes(media.url);
  if (bytes.byteLength > LIMITS.imageBytes) throw new ProviderError(`This image is ${bytes.byteLength.toLocaleString()} bytes; Bluesky accepts up to ${LIMITS.imageBytes.toLocaleString()}.`, { category: "validation", providerCode: "BlobTooLarge" });
  const res = await xrpc<{ blob?: Blob }>("com.atproto.repo.uploadBlob", { method: "POST", base: ctx.service, token: ctx.token, rawBody: bytes, contentType: media.mimeType, timeoutMs: 120_000 });
  if (!res.body.blob) throw new ProviderError("Bluesky returned no blob for the image", { category: "unknown", ambiguous: true });
  return res.body.blob;
}

/** The account's PDS host from its DID document; the sign-in host when the document cannot be read. */
export async function pdsHost(did: string, service: string): Promise<string> {
  const url = did.startsWith("did:web:") ? `https://${did.slice("did:web:".length)}/.well-known/did.json` : `https://plc.directory/${encodeURIComponent(did)}`;
  try {
    const res = await httpJson<DidDoc>(url);
    const pds = res.body?.service?.find((s) => s.id?.endsWith("#atproto_pds"))?.serviceEndpoint;
    return pds ? new URL(pds).host : new URL(service).host;
  } catch {
    return new URL(service).host;
  }
}

/** A 409 from the video service means "this exact file was uploaded before" and still carries the job. */
function jobFrom(status: number, body: unknown): JobStatus {
  const b = (body ?? {}) as { jobStatus?: JobStatus } & JobStatus & AtError;
  if (b.jobStatus) return b.jobStatus;
  if (b.state) return b;
  throw mapAtError(status === 200 ? 502 : status, b, { ambiguous: status >= 500 });
}

export async function uploadVideo(ctx: Ctx, media: MediaInput, sleep: Sleep = defaultSleep): Promise<Blob> {
  const host = await pdsHost(ctx.did, ctx.service);
  const exp = String(Math.floor(Date.now() / 1000) + 30 * 60);
  const auth = await xrpc<{ token?: string }>("com.atproto.server.getServiceAuth", { base: ctx.service, token: ctx.token, params: { aud: `did:web:${host}`, lxm: "com.atproto.repo.uploadBlob", exp } });
  if (!auth.body.token) throw new ProviderError("Bluesky issued no upload token for the video", { category: "permission" });
  const bytes = await fetchBytes(media.url);
  if (bytes.byteLength > LIMITS.videoBytes) throw new ProviderError(`This video is ${bytes.byteLength.toLocaleString()} bytes; Bluesky accepts up to ${LIMITS.videoBytes.toLocaleString()}.`, { category: "validation", providerCode: "BlobTooLarge" });
  const res = await httpJson<unknown>(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo${query({ did: ctx.did, name: "upload.mp4" })}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.body.token}`, "Content-Type": "video/mp4" },
    body: bytes,
    timeoutMs: 300_000,
  });
  return waitForJob(jobFrom(res.status, res.body), auth.body.token, sleep);
}

/** Poll until COMPLETED (a blob) or FAILED; about five minutes at most. */
export async function waitForJob(job: JobStatus, token: string, sleep: Sleep): Promise<Blob> {
  let current = job;
  for (let i = 0; i < 100; i++) {
    if (current.state === "JOB_STATE_COMPLETED" && current.blob) return current.blob;
    if (current.state === "JOB_STATE_FAILED") throw new ProviderError(`Bluesky could not process the video (${current.error ?? current.message ?? "failed"})`, { category: "validation" });
    if (!current.jobId) break;
    await sleep(3_000);
    const res = await xrpc<{ jobStatus?: JobStatus }>("app.bsky.video.getJobStatus", { base: VIDEO_SERVICE, token, params: { jobId: current.jobId } });
    current = res.body.jobStatus ?? current;
  }
  throw new ProviderError("Bluesky video processing timed out", { category: "temporary", ambiguous: true });
}

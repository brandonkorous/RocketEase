/*
 * X media upload (v1.1 chunked: INIT → APPEND* → FINALIZE → STATUS).
 * The v2 API has no chunked equivalent, so video and image attachments both go
 * through upload.twitter.com with an OAuth 2.0 user-context bearer token, which
 * requires the `media.write` scope on the app.
 */
import type { MediaInput } from "../types";
import { ProviderError } from "../types";
import { httpJson } from "../http";
import { mapXError, UPLOAD, type XError } from "./client";

const CHUNK = 4 * 1024 * 1024; // X caps a single APPEND at 5 MB.
type InitRes = { media_id_string?: string } & XError;
type StatusRes = { processing_info?: { state?: string; check_after_secs?: number; error?: { message?: string } } } & XError;

export const categoryFor = (mime: string) => (mime.startsWith("video/") ? "tweet_video" : mime === "image/gif" ? "tweet_gif" : "tweet_image");

async function command<T>(token: string, body: BodyInit, headers: Record<string, string> = {}): Promise<T> {
  const res = await httpJson<T & XError>(`${UPLOAD}/media/upload.json`, { method: "POST", headers: { Authorization: `Bearer ${token}`, ...headers }, body, timeoutMs: 60_000 });
  if (res.status >= 400) throw mapXError(res.status, res.body as XError, { headers: res.headers, ambiguous: res.status >= 500 });
  return res.body;
}

async function appendChunks(token: string, mediaId: string, bin: ArrayBuffer): Promise<void> {
  for (let i = 0, index = 0; i < bin.byteLength; i += CHUNK, index++) {
    const fd = new FormData();
    fd.append("command", "APPEND");
    fd.append("media_id", mediaId);
    fd.append("segment_index", String(index));
    fd.append("media", new Blob([bin.slice(i, i + CHUNK)]));
    await command(token, fd);
  }
}

/** FINALIZE may hand back async processing_info; poll STATUS until it settles. */
async function awaitProcessing(token: string, mediaId: string, info: StatusRes["processing_info"]): Promise<void> {
  let state = info;
  for (let i = 0; i < 60 && state && state.state !== "succeeded"; i++) {
    if (state.state === "failed") throw new ProviderError(state.error?.message ?? "X could not process the media.", { category: "validation", providerCode: "media_processing_failed" });
    await new Promise((r) => setTimeout(r, Math.max(1, state?.check_after_secs ?? 5) * 1000));
    const res = await command<StatusRes>(token, new URLSearchParams({ command: "STATUS", media_id: mediaId }));
    state = res.processing_info;
  }
  if (state && state.state !== "succeeded") throw new ProviderError("X is still processing the media", { category: "temporary" });
}

/** Upload one file and return its media id, attaching alt text when supplied. */
export async function uploadMedia(token: string, m: MediaInput): Promise<string> {
  const bin = await fetch(m.url).then((r) => r.arrayBuffer());
  const init = await command<InitRes>(
    token,
    new URLSearchParams({ command: "INIT", total_bytes: String(bin.byteLength), media_type: m.mimeType, media_category: categoryFor(m.mimeType) }),
  );
  const mediaId = init.media_id_string;
  if (!mediaId) throw new ProviderError("X did not return a media id", { category: "temporary" });
  await appendChunks(token, mediaId, bin);
  const fin = await command<StatusRes>(token, new URLSearchParams({ command: "FINALIZE", media_id: mediaId }));
  await awaitProcessing(token, mediaId, fin.processing_info);
  if (m.altText) await setAltText(token, mediaId, m.altText);
  return mediaId;
}

/** Alt text is a separate v1.1 call; failing it must not fail the post. */
export async function setAltText(token: string, mediaId: string, text: string): Promise<void> {
  await httpJson(`${UPLOAD}/media/metadata/create.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId, alt_text: { text: text.slice(0, 1000) } }),
  }).catch(() => undefined);
}

/*
 * Pinterest publishing: POST /v5/pins on the selected board.
 *   image     → media_source.source_type "image_url"
 *   carousel  → "multiple_image_urls" (2–5 images)
 *   video     → register with POST /v5/media, upload to the returned S3 form
 *               endpoint, poll GET /v5/media/{id}, then "video_id" (a video pin
 *               also REQUIRES a cover image).
 */
import type { ChannelDescriptor, Credential, PublicationStatus, PublishRequest, PublishResult } from "../types";
import { ProviderError } from "../types";
import { LIMITS, now, pin, pinUrl } from "./client";

type Settings = { title?: string; boardSectionId?: string; note?: string; dominantColor?: string };
type MediaReg = { media_id?: string; upload_url?: string; upload_parameters?: Record<string, string>; status?: string };
type PinRow = { id?: string; created_at?: string; title?: string; description?: string; alt_text?: string };

export const titleFor = (req: Pick<PublishRequest, "text" | "settings">) =>
  (((req.settings ?? {}) as Settings).title ?? req.text.split("\n")[0] ?? "").trim().slice(0, LIMITS.title) || undefined;

/** Register the video, POST the bytes to the returned form endpoint, wait for processing. */
async function uploadVideo(token: string, url: string): Promise<string> {
  const reg = await pin<MediaReg>("/media", token, { method: "POST", body: { media_type: "video" } });
  const { media_id: mediaId, upload_url: uploadUrl, upload_parameters: params } = reg.body;
  if (!mediaId || !uploadUrl) throw new ProviderError("Pinterest did not return a media upload target", { category: "temporary" });
  const bin = await fetch(url).then((r) => r.arrayBuffer());
  const fd = new FormData();
  for (const [k, v] of Object.entries(params ?? {})) fd.append(k, v);
  fd.append("file", new Blob([bin]));
  const put = await fetch(uploadUrl, { method: "POST", body: fd });
  if (put.status >= 400) throw new ProviderError("Pinterest video upload failed", { category: "temporary", ambiguous: true });
  for (let i = 0; i < 30; i++) {
    const st = await pin<MediaReg>(`/media/${encodeURIComponent(mediaId)}`, token);
    if (st.body.status === "succeeded") return mediaId;
    if (st.body.status === "failed") throw new ProviderError("Pinterest could not process the video.", { category: "validation", providerCode: "media_failed" });
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new ProviderError("Pinterest is still processing the video", { category: "temporary", ambiguous: false });
}

export async function mediaSource(token: string, req: PublishRequest): Promise<Record<string, unknown>> {
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  if (video) {
    // A chosen cover frame wins; otherwise the first image attached; Pinterest refuses a video pin with neither.
    const coverUrl = req.cover?.imageUrl ?? images[0]?.url;
    if (!coverUrl) throw new ProviderError("A Pinterest video pin needs a cover image.", { category: "validation", providerCode: "cover_image_required" });
    return { source_type: "video_id", media_id: await uploadVideo(token, video.url), cover_image_url: coverUrl };
  }
  if (images.length >= LIMITS.carouselMin && req.format === "carousel") {
    return { source_type: "multiple_image_urls", index: 0, items: images.slice(0, LIMITS.carouselMax).map((m) => ({ url: m.url, title: titleFor(req), description: req.text.slice(0, LIMITS.description), link: req.link })) };
  }
  if (!images.length) throw new ProviderError("A Pinterest pin needs an image or a video.", { category: "validation", providerCode: "media_required" });
  return { source_type: "image_url", url: images[0].url };
}

export function pinBody(req: PublishRequest, boardId: string, source: Record<string, unknown>) {
  const s = (req.settings ?? {}) as Settings;
  const alt = req.media.find((m) => m.altText)?.altText;
  return {
    board_id: boardId,
    board_section_id: s.boardSectionId,
    title: titleFor(req),
    description: req.text.slice(0, LIMITS.description),
    alt_text: alt?.slice(0, LIMITS.altText),
    link: req.link,
    note: s.note,
    dominant_color: s.dominantColor,
    media_source: source,
  };
}

export async function publish(cred: Credential, channel: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const source = await mediaSource(cred.accessToken, req);
  const res = await pin<PinRow>("/pins", cred.accessToken, { method: "POST", body: pinBody(req, channel.remoteId, source) });
  const id = res.body.id;
  if (!id) throw new ProviderError("Pinterest returned no pin id", { category: "unknown", ambiguous: true });
  return { remoteId: id, url: pinUrl(id), publishedAt: res.body.created_at ?? now() };
}

/** Pins carry no client reference: scan the board's most recent pins for the key marker. */
export async function findPublication(cred: Credential, channel: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const marker = idempotencyKey.slice(0, 8);
  const res = await pin<{ items?: PinRow[] }>(`/boards/${encodeURIComponent(channel.remoteId)}/pins`, cred.accessToken, { query: { page_size: "25" } }).catch(() => ({ body: { items: [] as PinRow[] } }));
  const hit = (res.body.items ?? []).find((p) => `${p.title ?? ""}\n${p.description ?? ""}\n${p.alt_text ?? ""}`.includes(marker));
  return hit?.id ? { remoteId: hit.id, url: pinUrl(hit.id), publishedAt: hit.created_at ?? now() } : null;
}

export async function publicationStatus(cred: Credential, remoteId: string): Promise<PublicationStatus> {
  try {
    await pin<PinRow>(`/pins/${encodeURIComponent(remoteId)}`, cred.accessToken);
    return { state: "published", url: pinUrl(remoteId) };
  } catch (e) {
    return e instanceof ProviderError && e.category === "deleted" ? { state: "deleted" } : { state: "unknown" };
  }
}

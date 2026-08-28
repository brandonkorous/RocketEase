import type { ChannelDescriptor, Credential, ProviderConfig, PublishRequest, PublishResult, PublicationStatus } from "../types";
import { ProviderError } from "../types";
import { graph, now } from "./graph";

const token = (cred: Credential, ch: ChannelDescriptor) => ch.channelToken ?? cred.accessToken;

export async function publishToPage(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const t = token(cred, ch);
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  let res: { id?: string; post_id?: string };
  if (video) res = await graph(`/${ch.remoteId}/videos`, cfg, t, { method: "POST", params: { file_url: video.url, description: req.text } });
  else if (images.length === 1) res = await graph(`/${ch.remoteId}/photos`, cfg, t, { method: "POST", params: { url: images[0].url, message: req.text, alt_text_custom: images[0].altText } });
  else if (images.length > 1) res = await publishPageAlbum(cfg, t, ch.remoteId, req);
  else res = await graph(`/${ch.remoteId}/feed`, cfg, t, { method: "POST", params: { message: req.text, link: req.link } });
  const remoteId = res.post_id ?? res.id;
  if (!remoteId) throw new ProviderError("Meta returned no post id", { category: "unknown", ambiguous: true });
  if (req.firstComment) await graph(`/${remoteId}/comments`, cfg, t, { method: "POST", params: { message: req.firstComment } }).catch(() => undefined);
  return { remoteId, url: `https://www.facebook.com/${remoteId}`, publishedAt: now() };
}

async function publishPageAlbum(cfg: ProviderConfig, t: string, pageId: string, req: PublishRequest) {
  const ids: string[] = [];
  for (const img of req.media.filter((m) => m.mimeType.startsWith("image/"))) {
    const ph = await graph<{ id: string }>(`/${pageId}/photos`, cfg, t, { method: "POST", params: { url: img.url, published: "false", alt_text_custom: img.altText } });
    ids.push(ph.id);
  }
  const params: Record<string, string> = { message: req.text };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  return graph<{ id?: string; post_id?: string }>(`/${pageId}/feed`, cfg, t, { method: "POST", params });
}

/** Instagram: create container(s) → publish. The container id is our reconciliation handle. */
export async function publishToInstagram(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const t = token(cred, ch);
  const igId = ch.remoteId;
  const containerId = await createContainer(cfg, t, igId, req);
  const pub = await graph<{ id: string }>(`/${igId}/media_publish`, cfg, t, { method: "POST", params: { creation_id: containerId } });
  if (req.firstComment) await graph(`/${pub.id}/comments`, cfg, t, { method: "POST", params: { message: req.firstComment } }).catch(() => undefined);
  const link = await graph<{ permalink?: string }>(`/${pub.id}`, cfg, t, { params: { fields: "permalink" } }).catch(() => ({ permalink: undefined }));
  return { remoteId: pub.id, url: link.permalink, publishedAt: now() };
}

async function createContainer(cfg: ProviderConfig, t: string, igId: string, req: PublishRequest): Promise<string> {
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  if (req.format === "carousel") {
    const children: string[] = [];
    for (const m of req.media) {
      const params = m.mimeType.startsWith("video/") ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" } : { image_url: m.url, is_carousel_item: "true" };
      children.push((await graph<{ id: string }>(`/${igId}/media`, cfg, t, { method: "POST", params })).id);
    }
    return (await graph<{ id: string }>(`/${igId}/media`, cfg, t, { method: "POST", params: { media_type: "CAROUSEL", children: children.join(","), caption: req.text } })).id;
  }
  if (video) {
    const mediaType = req.format === "story" ? "STORIES" : "REELS";
    const id = (await graph<{ id: string }>(`/${igId}/media`, cfg, t, { method: "POST", params: { media_type: mediaType, video_url: video.url, caption: req.format === "story" ? undefined : req.text } })).id;
    await waitForContainer(cfg, t, id);
    return id;
  }
  const params: Record<string, string | undefined> = { image_url: images[0].url, caption: req.text, alt_text: images[0].altText };
  if (req.format === "story") params.media_type = "STORIES";
  return (await graph<{ id: string }>(`/${igId}/media`, cfg, t, { method: "POST", params })).id;
}

/** Video containers process asynchronously; poll status_code up to ~5 minutes. */
async function waitForContainer(cfg: ProviderConfig, t: string, containerId: string) {
  for (let i = 0; i < 30; i++) {
    const s = await graph<{ status_code?: string; status?: string }>(`/${containerId}`, cfg, t, { params: { fields: "status_code,status" } });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new ProviderError(`Instagram could not process the video (${s.status ?? s.status_code})`, { category: "validation" });
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new ProviderError("Instagram video processing timed out", { category: "temporary", ambiguous: true });
}

/** Meta has no client-reference lookup; scan recent posts for our marker text. */
export async function findPublication(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const t = token(cred, ch);
  const page = ch.kind === "facebook_page";
  const edge = page ? `/${ch.remoteId}/posts` : `/${ch.remoteId}/media`;
  const fields = page ? "id,message,created_time,permalink_url" : "id,caption,timestamp,permalink";
  type Row = { id: string; message?: string; caption?: string; created_time?: string; timestamp?: string; permalink_url?: string; permalink?: string };
  const res = await graph<{ data?: Row[] }>(edge, cfg, t, { params: { fields, limit: "25" } });
  const hit = (res.data ?? []).find((p) => (p.message ?? p.caption ?? "").includes(idempotencyKey.slice(0, 8)));
  return hit ? { remoteId: hit.id, url: hit.permalink_url ?? hit.permalink, publishedAt: hit.created_time ?? hit.timestamp ?? now() } : null;
}

export async function publicationStatus(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, remoteId: string): Promise<PublicationStatus> {
  try {
    const r = await graph<{ permalink_url?: string; permalink?: string }>(`/${remoteId}`, cfg, token(cred, ch), { params: { fields: ch.kind === "facebook_page" ? "id,permalink_url" : "id,permalink" } });
    return { state: "published", url: r.permalink_url ?? r.permalink };
  } catch (e) {
    return e instanceof ProviderError && e.category === "deleted" ? { state: "deleted" } : { state: "unknown" };
  }
}

/*
 * TikTok Content Posting API (Direct Post): video via /post/publish/video/init/,
 * photo posts via /post/publish/content/init/ (media_type PHOTO). Publishing is
 * asynchronous, so we poll /post/publish/status/fetch/ until complete.
 */
import type { ChannelDescriptor, Credential, PublishRequest, PublishResult, PublicationStatus } from "../types";
import { ProviderError } from "../types";
import { now, tt } from "./client";

type Settings = { privacy?: string; disableComment?: boolean; disableDuet?: boolean; disableStitch?: boolean };
type Status = { data?: { status?: string; publicaly_available_post_id?: string[]; fail_reason?: string } };
type Video = { id: string; title?: string; create_time?: number; share_url?: string };

async function initPublish(token: string, req: PublishRequest): Promise<string> {
  const s = (req.settings ?? {}) as Settings;
  // is_aigc: Content Posting API self-declaration; TikTok then draws its own "AI-generated" tag.
  const postInfo = { title: req.text.slice(0, 2200), privacy_level: s.privacy ?? "PUBLIC_TO_EVERYONE", disable_comment: Boolean(s.disableComment), disable_duet: Boolean(s.disableDuet), disable_stitch: Boolean(s.disableStitch), ...(req.disclosure?.synthetic ? { is_aigc: true } : {}) };
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  const cover = req.cover ? { video_cover_timestamp_ms: Math.max(0, Math.round(req.cover.offsetMs)) } : {};
  const r = video
    ? await tt<{ data?: { publish_id?: string } }>("/post/publish/video/init/", token, { post_info: { ...postInfo, ...cover }, source_info: { source: "PULL_FROM_URL", video_url: video.url } })
    : await tt<{ data?: { publish_id?: string } }>("/post/publish/content/init/", token, { post_info: { ...postInfo, description: req.text }, source_info: { source: "PULL_FROM_URL", photo_images: req.media.map((m) => m.url), photo_cover_index: 0 }, post_mode: "DIRECT_POST", media_type: "PHOTO" });
  const id = r.data?.publish_id;
  if (!id) throw new ProviderError("TikTok returned no publish id", { category: "unknown", ambiguous: true });
  return id;
}

export async function publish(cred: Credential, channel: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const publishId = await initPublish(cred.accessToken, req);
  for (let i = 0; i < 30; i++) {
    const st = await tt<Status>("/post/publish/status/fetch/", cred.accessToken, { publish_id: publishId });
    const status = st.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      const id = st.data?.publicaly_available_post_id?.[0] ?? publishId;
      return { remoteId: id, url: channel.handle ? `https://www.tiktok.com/${channel.handle}/video/${id}` : undefined, publishedAt: now() };
    }
    if (status === "FAILED") throw new ProviderError(`TikTok rejected the post (${st.data?.fail_reason ?? "unknown"})`, { category: "validation", providerCode: st.data?.fail_reason });
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new ProviderError("TikTok publish is still processing", { category: "temporary", ambiguous: true });
}

/** No client reference on TikTok posts: scan recent videos for our title marker. */
export async function findPublication(cred: Credential, idempotencyKey: string): Promise<PublishResult | null> {
  const r = await tt<{ data?: { videos?: Video[] } }>("/video/list/?fields=id,title,create_time,share_url", cred.accessToken, { max_count: 20 }).catch(() => ({ data: { videos: [] as Video[] } }));
  const marker = idempotencyKey.slice(0, 8);
  const hit = (r.data?.videos ?? []).find((v) => (v.title ?? "").includes(marker));
  return hit ? { remoteId: hit.id, url: hit.share_url, publishedAt: hit.create_time ? new Date(hit.create_time * 1000).toISOString() : now() } : null;
}

export async function publicationStatus(cred: Credential, remoteId: string): Promise<PublicationStatus> {
  const r = await tt<{ data?: { videos?: { id: string; share_url?: string }[] } }>("/video/query/?fields=id,share_url", cred.accessToken, { filters: { video_ids: [remoteId] } }).catch(() => null);
  const v = r?.data?.videos?.[0];
  return v ? { state: "published", url: v.share_url } : { state: "unknown" };
}

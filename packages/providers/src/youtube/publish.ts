/*
 * YouTube publishing: videos.insert as a RESUMABLE upload.
 *   1. POST /upload/youtube/v3/videos?uploadType=resumable with the metadata and
 *      X-Upload-Content-{Length,Type}; the session URL comes back in `Location`.
 *   2. PUT the bytes to that session URL; the finished resource is the response.
 * Scheduling is native: `status.publishAt` requires `status.privacyStatus:"private"`.
 * Shorts are ordinary uploads — YouTube classifies them from duration + aspect
 * ratio, there is no Shorts field in the API.
 */
import type { ChannelDescriptor, Credential, PublicationStatus, PublishRequest, PublishResult } from "../types";
import { ProviderError } from "../types";
import { DATA, isShortEligible, mapYouTubeError, now, UPLOAD, videoUrl, yt } from "./client";

export const TITLE_MAX = 100;

type VideoRow = { id?: string; snippet?: { title?: string; description?: string; publishedAt?: string }; status?: { uploadStatus?: string; privacyStatus?: string; publishAt?: string; rejectionReason?: string } };
type Settings = { title?: string; privacy?: "public" | "unlisted" | "private"; publishAt?: string; categoryId?: string; tags?: string[]; madeForKids?: boolean; notifySubscribers?: boolean };

/** Title defaults to the first line of the body text; YouTube rejects an empty title. */
export function titleFor(req: PublishRequest): string {
  const s = (req.settings ?? {}) as Settings;
  const first = (s.title ?? req.text.split("\n")[0] ?? "").trim();
  return (first || "Untitled").slice(0, TITLE_MAX);
}

export function videoBody(req: PublishRequest) {
  const s = (req.settings ?? {}) as Settings;
  // publishAt only takes effect on a private video; sending it with public/unlisted is a 400.
  const scheduled = Boolean(s.publishAt);
  return {
    snippet: { title: titleFor(req), description: req.text.slice(0, 5000), tags: s.tags ?? undefined, categoryId: s.categoryId ?? "22" },
    status: {
      privacyStatus: scheduled ? "private" : (s.privacy ?? "public"),
      publishAt: s.publishAt,
      selfDeclaredMadeForKids: Boolean(s.madeForKids),
      // Studio's "altered or synthetic content" attribute; only sent when declared.
      ...(req.disclosure?.synthetic ? { containsSyntheticMedia: true } : {}),
      embeddable: true,
    },
  };
}

/** Open the resumable session and return its upload URL. */
async function startSession(token: string, req: PublishRequest, mime: string, bytes: number | undefined): Promise<string> {
  const s = (req.settings ?? {}) as Settings;
  const notify = s.notifySubscribers === false ? "&notifySubscribers=false" : "";
  const res = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status${notify}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime,
      ...(bytes ? { "X-Upload-Content-Length": String(bytes) } : {}),
    },
    body: JSON.stringify(videoBody(req)),
  });
  if (res.status >= 400) {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep the raw string */
    }
    throw mapYouTubeError(res.status, parsed as never, { headers: res.headers, ambiguous: res.status >= 500 });
  }
  const location = res.headers.get("location");
  if (!location) throw new ProviderError("YouTube did not return a resumable upload session", { category: "temporary" });
  return location;
}

/** PUT the media bytes into the session. A 5xx here is ambiguous: the video may exist. */
async function sendBytes(session: string, url: string, mime: string): Promise<VideoRow> {
  const source = await fetch(url);
  if (!source.ok) throw new ProviderError("Could not read the video from storage", { category: "temporary" });
  const bin = await source.arrayBuffer();
  const put = await fetch(session, { method: "PUT", headers: { "Content-Type": mime, "Content-Length": String(bin.byteLength) }, body: bin });
  const text = await put.text();
  if (put.status >= 400) {
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep the raw string */
    }
    throw mapYouTubeError(put.status, parsed as never, { headers: put.headers, ambiguous: true });
  }
  return (text ? JSON.parse(text) : {}) as VideoRow;
}

export async function publish(cred: Credential, _channel: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  if (!video) throw new ProviderError("YouTube posts need a video file.", { category: "validation", providerCode: "video_required" });
  if (req.format === "reel" && !isShortEligible(video.durationSeconds, video.width, video.height))
    throw new ProviderError("A Short must be 3 minutes or shorter and square or vertical.", { category: "validation", providerCode: "shorts_aspect_ratio" });
  const session = await startSession(cred.accessToken, req, video.mimeType, video.bytes);
  const row = await sendBytes(session, video.url, video.mimeType);
  if (!row.id) throw new ProviderError("YouTube returned no video id", { category: "unknown", ambiguous: true });
  return { remoteId: row.id, url: videoUrl(row.id), publishedAt: row.snippet?.publishedAt ?? now() };
}

type PlaylistItem = { contentDetails?: { videoId?: string; videoPublishedAt?: string }; snippet?: { title?: string; description?: string } };

/**
 * YouTube has no client-supplied reference on a video, so reconciliation scans
 * the channel's uploads playlist (1 quota unit) for the key marker in the
 * description. `uploadsPlaylistId` is captured on the channel descriptor.
 */
export async function findPublication(cred: Credential, channel: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const playlist = uploadsPlaylistOf(channel);
  const marker = idempotencyKey.slice(0, 8);
  const res = await yt<{ items?: PlaylistItem[] }>(`/playlistItems?part=snippet,contentDetails&maxResults=25&playlistId=${encodeURIComponent(playlist)}`, cred.accessToken).catch(() => ({
    body: { items: [] as PlaylistItem[] },
  }));
  const hit = (res.body.items ?? []).find((i) => `${i.snippet?.title ?? ""}\n${i.snippet?.description ?? ""}`.includes(marker));
  const id = hit?.contentDetails?.videoId;
  return id ? { remoteId: id, url: videoUrl(id), publishedAt: hit?.contentDetails?.videoPublishedAt ?? now() } : null;
}

/** Uploads playlist id: the channel id with "UC" swapped for "UU" (documented Data API relationship). */
export const uploadsPlaylistOf = (channel: ChannelDescriptor) =>
  (channel.remoteId.startsWith("UC") ? `UU${channel.remoteId.slice(2)}` : channel.remoteId);

export async function publicationStatus(cred: Credential, remoteId: string): Promise<PublicationStatus> {
  const res = await yt<{ items?: VideoRow[] }>(`/videos?part=status,snippet&id=${encodeURIComponent(remoteId)}`, cred.accessToken, { base: DATA }).catch(() => null);
  const v = res?.body.items?.[0];
  if (!v) return { state: res ? "deleted" : "unknown" };
  const upload = v.status?.uploadStatus;
  if (upload === "uploaded" || upload === "processing") return { state: "processing", url: videoUrl(remoteId) };
  if (upload === "rejected" || upload === "deleted" || upload === "failed") return { state: "deleted" };
  return { state: "published", url: videoUrl(remoteId) };
}

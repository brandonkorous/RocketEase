/*
 * LinkedIn publishing via the Posts API. Media go through the Images/Videos
 * APIs (initializeUpload → PUT → reference the returned URN).
 */
import type { ChannelDescriptor, Credential, PublishRequest, PublishResult, PublicationStatus } from "../types";
import { ProviderError } from "../types";
import { li, now, postUrl } from "./client";

type UploadInit = { value: { uploadUrl?: string; uploadInstructions?: { uploadUrl: string }[]; image?: string; video?: string } };

async function uploadMedia(token: string, owner: string, kind: "images" | "videos", url: string, mime: string): Promise<string> {
  const init = await li<UploadInit>(`/${kind}?action=initializeUpload`, token, { method: "POST", body: { initializeUploadRequest: { owner } } });
  const uploadUrl = init.body.value.uploadUrl ?? init.body.value.uploadInstructions?.[0]?.uploadUrl;
  const urn = init.body.value.image ?? init.body.value.video;
  if (!uploadUrl || !urn) throw new ProviderError("LinkedIn did not return an upload URL", { category: "temporary" });
  const bin = await fetch(url).then((r) => r.arrayBuffer());
  const put = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": mime }, body: bin });
  if (put.status >= 400) throw new ProviderError("LinkedIn media upload failed", { category: "temporary" });
  return urn;
}

async function buildContent(token: string, author: string, req: PublishRequest): Promise<Record<string, unknown> | undefined> {
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  if (video) return { media: { id: await uploadMedia(token, author, "videos", video.url, video.mimeType), title: req.text.slice(0, 200) } };
  if (images.length === 1) return { media: { id: await uploadMedia(token, author, "images", images[0].url, images[0].mimeType), altText: images[0].altText } };
  if (images.length > 1) {
    const uploaded = [];
    for (const i of images) uploaded.push({ id: await uploadMedia(token, author, "images", i.url, i.mimeType), altText: i.altText });
    return { multiImage: { images: uploaded } };
  }
  if (req.link) return { article: { source: req.link, title: req.text.slice(0, 100) } };
  return undefined;
}

export async function publish(cred: Credential, channel: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const author = channel.remoteId;
  const token = cred.accessToken;
  const content = await buildContent(token, author, req);
  const res = await li<unknown>("/posts", token, {
    method: "POST",
    body: { author, commentary: req.text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(content ? { content } : {}) },
  });
  const remoteId = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (!remoteId) throw new ProviderError("LinkedIn returned no post id", { category: "unknown", ambiguous: true });
  if (req.firstComment) await li(`/socialActions/${encodeURIComponent(remoteId)}/comments`, token, { method: "POST", body: { actor: author, message: { text: req.firstComment } } }).catch(() => undefined);
  return { remoteId, url: postUrl(remoteId), publishedAt: now() };
}

type PostRow = { id: string; commentary?: string; createdAt?: number };

/** No client reference on LinkedIn posts: scan the author's recent posts for our text marker. */
export async function findPublication(cred: Credential, channel: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const res = await li<{ elements?: PostRow[] }>(`/posts?q=author&author=${encodeURIComponent(channel.remoteId)}&count=20&sortBy=LAST_MODIFIED`, cred.accessToken).catch(() => ({ body: { elements: [] as PostRow[] } }));
  const marker = idempotencyKey.slice(0, 8);
  const hit = (res.body.elements ?? []).find((p) => (p.commentary ?? "").includes(marker));
  return hit ? { remoteId: hit.id, url: postUrl(hit.id), publishedAt: hit.createdAt ? new Date(hit.createdAt).toISOString() : now() } : null;
}

export async function publicationStatus(cred: Credential, remoteId: string): Promise<PublicationStatus> {
  try {
    await li(`/posts/${encodeURIComponent(remoteId)}`, cred.accessToken);
    return { state: "published", url: postUrl(remoteId) };
  } catch (e) {
    return e instanceof ProviderError && e.category === "deleted" ? { state: "deleted" } : { state: "unknown" };
  }
}

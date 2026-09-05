/*
 * Bluesky publishing: one com.atproto.repo.createRecord of an
 * app.bsky.feed.post. A post holds ONE embed — up to four images, or a video,
 * or a link card — so a link on a media post stays a facet in the text. The
 * record key is derived from the idempotency key (client.ts#tidFromKey), which
 * is what makes the publish idempotent and the reconciliation a lookup.
 */
import type { ChannelDescriptor, Credential, MediaInput, PublicationStatus, PublishRequest, PublishResult } from "../types";
import { ProviderError } from "../types";
import { POST_COLLECTION, now, postUrl, rkeyOf, tidFromKey, xrpc } from "./client";
import { uploadImage, uploadVideo, type Blob, type Ctx, type Sleep, defaultSleep } from "./media";
import { facetsFor, type Facet, type ResolveHandle } from "./richtext";

export type StrongRef = { uri: string; cid: string };
export type BlueskySettings = { langs?: string[] };

export type Embed =
  | { $type: "app.bsky.embed.images"; images: { image: Blob; alt: string }[] }
  | { $type: "app.bsky.embed.video"; video: Blob; alt?: string }
  | { $type: "app.bsky.embed.external"; external: { uri: string; title: string; description: string } };

export type PostRecord = {
  $type: typeof POST_COLLECTION;
  text: string;
  createdAt: string;
  langs?: string[];
  facets?: Facet[];
  embed?: Embed;
  reply?: { root: StrongRef; parent: StrongRef };
};

export type Blobs = { images: { blob: Blob; alt: string }[]; video?: { blob: Blob; alt?: string } };

const isVideo = (m: MediaInput) => m.mimeType.startsWith("video/");

export const ctxFor = (service: string, cred: Credential, ch: ChannelDescriptor): Ctx => ({ service, token: cred.accessToken, did: ch.remoteId });

export const resolver = (service: string): ResolveHandle => async (handle) => (await xrpc<{ did?: string }>("com.atproto.identity.resolveHandle", { base: service, params: { handle } })).body.did ?? null;

export function embedFor(req: Omit<PublishRequest, "idempotencyKey">, blobs: Blobs): Embed | undefined {
  if (blobs.video) return { $type: "app.bsky.embed.video", video: blobs.video.blob, alt: blobs.video.alt };
  if (blobs.images.length) return { $type: "app.bsky.embed.images", images: blobs.images.map((i) => ({ image: i.blob, alt: i.alt })) };
  if (req.link) return { $type: "app.bsky.embed.external", external: { uri: req.link, title: safeHost(req.link), description: "" } };
  return undefined;
}

const safeHost = (link: string) => {
  try {
    return new URL(link).host;
  } catch {
    return link;
  }
};

export async function buildRecord(req: Omit<PublishRequest, "idempotencyKey">, blobs: Blobs, resolveHandle: ResolveHandle, createdAt = now()): Promise<PostRecord> {
  const s = (req.settings ?? {}) as BlueskySettings;
  const facets = await facetsFor(req.text, resolveHandle);
  const embed = embedFor(req, blobs);
  return { $type: POST_COLLECTION, text: req.text, createdAt, ...(s.langs?.length ? { langs: s.langs.slice(0, 3) } : {}), ...(facets.length ? { facets } : {}), ...(embed ? { embed } : {}) };
}

async function uploadAll(ctx: Ctx, media: MediaInput[], sleep: Sleep): Promise<Blobs> {
  const video = media.find(isVideo);
  if (video) return { images: [], video: { blob: await uploadVideo(ctx, video, sleep), alt: video.altText } };
  const images: Blobs["images"] = [];
  for (const m of media.filter((x) => x.mimeType.startsWith("image/"))) images.push({ blob: await uploadImage(ctx, m), alt: m.altText ?? "" });
  return { images };
}

export async function createRecord(ctx: Ctx, rkey: string, record: PostRecord): Promise<StrongRef> {
  const res = await xrpc<{ uri?: string; cid?: string }>("com.atproto.repo.createRecord", { method: "POST", base: ctx.service, token: ctx.token, body: { repo: ctx.did, collection: POST_COLLECTION, rkey, record } });
  if (!res.body.uri || !res.body.cid) throw new ProviderError("Bluesky returned no record reference", { category: "unknown", ambiguous: true });
  return { uri: res.body.uri, cid: res.body.cid };
}

export async function getRecord(ctx: Ctx, rkey: string): Promise<(StrongRef & { value?: PostRecord }) | null> {
  try {
    const res = await xrpc<{ uri?: string; cid?: string; value?: PostRecord }>("com.atproto.repo.getRecord", { base: ctx.service, token: ctx.token, params: { repo: ctx.did, collection: POST_COLLECTION, rkey } });
    return res.body.uri && res.body.cid ? { uri: res.body.uri, cid: res.body.cid, value: res.body.value } : null;
  } catch (e) {
    if (e instanceof ProviderError && e.category === "deleted") return null;
    throw e;
  }
}

export async function publish(service: string, cred: Credential, ch: ChannelDescriptor, req: PublishRequest, sleep: Sleep = defaultSleep): Promise<PublishResult> {
  const ctx = ctxFor(service, cred, ch);
  const rkey = tidFromKey(req.idempotencyKey);
  // The same key may already have produced this record (an earlier attempt that timed out after writing).
  const existing = await getRecord(ctx, rkey);
  if (existing) return { remoteId: existing.uri, url: postUrl(ch.handle, ch.remoteId, existing.uri), publishedAt: existing.value?.createdAt ?? now() };
  const blobs = await uploadAll(ctx, req.media, sleep);
  const record = await buildRecord(req, blobs, resolver(service));
  const ref = await createRecord(ctx, rkey, record);
  return { remoteId: ref.uri, url: postUrl(ch.handle, ch.remoteId, ref.uri), publishedAt: record.createdAt };
}

/** The record key is a function of the idempotency key, so this is a lookup, not a scan. */
export async function findPublication(service: string, cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const hit = await getRecord(ctxFor(service, cred, ch), tidFromKey(idempotencyKey)).catch(() => null);
  return hit ? { remoteId: hit.uri, url: postUrl(ch.handle, ch.remoteId, hit.uri), publishedAt: hit.value?.createdAt ?? now() } : null;
}

export async function publicationStatus(service: string, cred: Credential, ch: ChannelDescriptor, remoteId: string): Promise<PublicationStatus> {
  try {
    const hit = await getRecord(ctxFor(service, cred, ch), rkeyOf(remoteId));
    return hit ? { state: "published", url: postUrl(ch.handle, ch.remoteId, hit.uri) } : { state: "deleted" };
  } catch {
    return { state: "unknown" };
  }
}

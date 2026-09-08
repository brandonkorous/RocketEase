/*
 * Bluesky search: app.bsky.feed.searchPosts, run AS a connected Bluesky
 * account through its service host (the PDS proxies the query to the AppView).
 * The public AppView refuses this one query without a session — a plain GET to
 * public.api.bsky.app answered 403 on 2026-09-06 while profiles and feeds still
 * answered 200 — so "no connection needed" was not true and is not claimed.
 * Lexicon: q, sort latest|top, since, limit 1–100 (25), cursor → { posts, cursor }.
 */
import { httpJson, ProviderError, categoryFromStatus } from "@rocketease/providers";
import type { ListeningItem, SearchInput, SearchPage } from "../types";

export const BLUESKY_SERVICE = () => process.env.BLUESKY_SERVICE?.trim() || "https://bsky.social";

export type BskyPost = { uri?: string; author?: { did?: string; handle?: string; displayName?: string }; record?: { text?: string; createdAt?: string }; indexedAt?: string };

const rkey = (uri: string) => uri.split("/").pop() ?? uri;

export function bskyToItem(p: BskyPost): ListeningItem | null {
  if (!p.uri || !p.author?.handle) return null;
  const handle = p.author.handle;
  return {
    network: "bluesky",
    remoteId: p.uri,
    author: { name: p.author.displayName?.trim() || handle, handle: `@${handle}`, url: `https://bsky.app/profile/${handle}` },
    text: p.record?.text ?? "",
    url: `https://bsky.app/profile/${handle}/post/${rkey(p.uri)}`,
    occurredAt: p.record?.createdAt ?? p.indexedAt ?? new Date().toISOString(),
  };
}

export async function searchBluesky(token: string, input: SearchInput, cursor?: string): Promise<SearchPage> {
  const u = new URL(`${BLUESKY_SERVICE()}/xrpc/app.bsky.feed.searchPosts`);
  u.searchParams.set("q", input.term);
  u.searchParams.set("sort", "latest");
  u.searchParams.set("since", input.since.toISOString());
  u.searchParams.set("limit", String(Math.min(100, Math.max(1, input.limit))));
  if (cursor) u.searchParams.set("cursor", cursor);
  const res = await httpJson<{ posts?: BskyPost[]; cursor?: string; error?: string; message?: string }>(u.toString(), { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 20_000 });
  if (res.status >= 400) throw new ProviderError(res.body?.message ?? res.body?.error ?? `Bluesky search answered ${res.status}`, { category: categoryFromStatus(res.status), providerCode: res.body?.error });
  return { items: (res.body?.posts ?? []).map(bskyToItem).filter((i): i is ListeningItem => Boolean(i)), cursor: res.body?.cursor };
}

/*
 * Bluesky insights: per-post counts from app.bsky.feed.getPosts (likeCount,
 * repostCount, replyCount, quoteCount) and the follower count from
 * app.bsky.actor.getProfile. Bluesky publishes no daily series and no views or
 * impressions at all, so post numbers are lifetime totals recorded on the fetch
 * day, exactly as X and LinkedIn per-post stats are.
 */
import type { InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { xrpc } from "./client";

export type PostView = { uri?: string; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number };
type Profile = { followersCount?: number };

/** Reposts and quotes are both re-distribution, so they fold into shares with joint provenance. */
export function postToFacts(p: PostView, day: string): InsightFact[] {
  if (!p.uri) return [];
  const out: InsightFact[] = [];
  if (typeof p.likeCount === "number") out.push({ entity: "post", remoteId: p.uri, metric: "reactions", day, value: p.likeCount, source: "bluesky.likeCount" });
  if (typeof p.replyCount === "number") out.push({ entity: "post", remoteId: p.uri, metric: "comments", day, value: p.replyCount, source: "bluesky.replyCount" });
  if (typeof p.repostCount === "number" || typeof p.quoteCount === "number") {
    out.push({ entity: "post", remoteId: p.uri, metric: "shares", day, value: (p.repostCount ?? 0) + (p.quoteCount ?? 0), source: "bluesky.repostCount+quoteCount" });
  }
  return out;
}

export async function fetchInsights(service: string, cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const facts: InsightFact[] = [];
  const uris = req.postRemoteIds ?? [];
  for (let i = 0; i < uris.length; i += 25) {
    const res = await xrpc<{ posts?: PostView[] }>("app.bsky.feed.getPosts", { base: service, token: cred.accessToken, params: { uris: uris.slice(i, i + 25) } }).catch(() => ({ body: { posts: [] as PostView[] } }));
    for (const p of res.body.posts ?? []) facts.push(...postToFacts(p, req.until));
  }
  const profile = await xrpc<Profile>("app.bsky.actor.getProfile", { base: service, token: cred.accessToken, params: { actor: ch.remoteId } }).catch(() => ({ body: {} as Profile }));
  if (typeof profile.body.followersCount === "number") facts.push({ entity: "channel", metric: "followers", day: req.until, value: profile.body.followersCount, source: "bluesky.followersCount" });
  return { facts, timezone: "UTC" };
}

import "server-only";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { estimatePublishCost, type CapWindow, type ChannelKind, type ProviderKey } from "@make-it-social/providers";
import { db } from "@/db";
import { postVariant } from "@/db/schema/content";
import { dayKey, zonedToUtc } from "@/lib/time";

/*
 * How much of a network's per-day publishing cap this workspace has already
 * spent. We can only count what WE sent — a post made in the native app or by
 * another tool also counts against the network's cap and is invisible to us,
 * so every surface must say so (see QuotaGauge's caption).
 */

export type ChannelQuota = {
  channelId: string;
  /** Publishes we sent inside the cap's window. */
  used: number;
  cap: number;
  window: CapWindow;
  note: string;
};

type QuotaChannel = { id: string; provider: string; kind: string };

export async function channelQuotas(workspaceId: string, timezone: string, channels: QuotaChannel[]): Promise<ChannelQuota[]> {
  const capped = channels
    .map((c) => ({ c, cap: estimatePublishCost(c.provider as ProviderKey, c.kind as ChannelKind, {}).dailyCap }))
    .filter((x): x is { c: QuotaChannel; cap: NonNullable<ReturnType<typeof estimatePublishCost>["dailyCap"]> } => Boolean(x.cap));
  if (capped.length === 0) return [];

  const now = new Date();
  const rolling = new Date(now.getTime() - 24 * 60 * 60_000);
  const midnight = zonedToUtc(`${dayKey(now, timezone)}T00:00`, timezone);
  const since = rolling < midnight ? rolling : midnight;
  const rows = await db
    .select({ channelId: postVariant.channelId, publishedAt: postVariant.publishedAt })
    .from(postVariant)
    .where(and(eq(postVariant.workspaceId, workspaceId), isNotNull(postVariant.publishedAt), gte(postVariant.publishedAt, since)));

  return capped.map(({ c, cap }) => {
    const from = cap.window === "day" ? midnight : rolling;
    const used = rows.filter((r) => r.channelId === c.id && r.publishedAt && r.publishedAt >= from).length;
    return { channelId: c.id, used, cap: cap.count, window: cap.window, note: cap.note };
  });
}

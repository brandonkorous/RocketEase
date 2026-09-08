/*
 * The daily update check (general worker) and its read side. Every outcome is
 * written — a feed that cannot be reached is a row with an error, not silence.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { installUpdate } from "@/db/schema/install";
import { updateChannel, type UpdateChannel } from "@/lib/deployment";
import { log } from "@/lib/log";
import { parseUpdateFeed } from "./feed";

export const updateFeedUrl = () => process.env.UPDATE_FEED_URL?.trim() || null;

export type UpdateRow = typeof installUpdate.$inferSelect;

async function fetchFeed(url: string): Promise<{ json: unknown } | { error: string }> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { error: `The update feed answered ${res.status}.` };
    return { json: await res.json() };
  } catch (err) {
    return { error: err instanceof Error && err.name === "TimeoutError" ? "The update feed did not answer within 10 seconds." : "The update feed could not be reached." };
  }
}

/** Asks the feed for this install's channel and records what it said. No-op without UPDATE_FEED_URL. */
export async function checkForUpdates(now = new Date()): Promise<void> {
  const url = updateFeedUrl();
  if (!url) return;
  const channel = updateChannel();
  const result = await fetchFeed(url);
  const entry = "json" in result ? parseUpdateFeed(result.json, channel) : null;
  const error = "error" in result ? result.error : entry ? null : `The update feed lists nothing for the ${channel} channel.`;
  await db
    .insert(installUpdate)
    .values({ channel, latestVersion: entry?.version ?? null, imageTag: entry?.imageTag ?? null, notesUrl: entry?.notes ?? null, checkedAt: now, error })
    .onConflictDoUpdate({ target: installUpdate.channel, set: { latestVersion: entry?.version ?? null, imageTag: entry?.imageTag ?? null, notesUrl: entry?.notes ?? null, checkedAt: now, error } });
  if (error) log.warn("update check failed", { channel, error });
}

export async function latestUpdate(channel: UpdateChannel = updateChannel()): Promise<UpdateRow | null> {
  const [row] = await db.select().from(installUpdate).where(eq(installUpdate.channel, channel)).limit(1);
  return row ?? null;
}

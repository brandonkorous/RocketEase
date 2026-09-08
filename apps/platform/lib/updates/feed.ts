/*
 * The update feed: one JSON document RocketEase publishes, read only when
 * UPDATE_FEED_URL is set (the chart leaves it empty, so an install never calls
 * out unless its operator chose to). Shape, per channel:
 *
 *   { "stable": { "version": "v1.2.0", "imageTag": "v1.2.0", "notes": "https://…" }, "edge": { … } }
 *
 * Pure parsing here; lib/updates/check.ts fetches and stores.
 */
import { z } from "zod";
import type { UpdateChannel } from "@/lib/deployment";

const entry = z.object({ version: z.string().min(1).max(64), imageTag: z.string().min(1).max(128).optional(), notes: z.string().url().optional() });
const feedSchema = z.object({ stable: entry.optional(), edge: entry.optional() });

export type FeedEntry = z.infer<typeof entry>;

export function parseUpdateFeed(json: unknown, channel: UpdateChannel): FeedEntry | null {
  const parsed = feedSchema.safeParse(json);
  return parsed.success ? (parsed.data[channel] ?? null) : null;
}

export type UpdateStanding = "current" | "listed_newer" | "unknown";

/**
 * "current" only when the listed version IS the running one. A different label
 * is reported as "a newer build is listed", never as a computed distance —
 * an edge build and a stable tag are not comparable by number.
 */
export function updateStanding(running: string, latest: string | null): UpdateStanding {
  if (!latest) return "unknown";
  return latest === running ? "current" : "listed_newer";
}

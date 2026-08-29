/*
 * Rights gate for paid spend (CAM-002 + M8.4). Organic clearance rarely
 * includes paid, and Spark codes / partnership permissions run their own
 * clocks — so a promotion is refused before the identity check, not after.
 */
import type { ContentItem, PostVariant } from "@/db/schema/content";
import { grantsForUse, rightsAssets } from "./queries";
import { rightsProblemsForPromotion } from "./rules";
import type { RightsProblem } from "./types";

type Use = { item: ContentItem; variant: PostVariant; channelId: string; timezone: string };
type Window = { startAt: Date; endAt: Date | null };

export async function promotionRightsProblems(workspaceId: string, use: Use, window: Window): Promise<RightsProblem[]> {
  const assetIds = use.variant.assetIdsOverride ?? use.item.sharedAssetIds;
  const [assets, grants] = await Promise.all([rightsAssets(assetIds), grantsForUse(workspaceId, assetIds, use.channelId)]);
  return rightsProblemsForPromotion({ ...window, channelId: use.channelId, timeZone: use.timezone }, assets, grants);
}

/** First blocking message, with a count when several clocks are wrong. Null when the flight is clear. */
export async function promotionRightsIssue(workspaceId: string, use: Use, window: Window): Promise<string | null> {
  const errors = (await promotionRightsProblems(workspaceId, use, window)).filter((p) => p.severity === "error");
  if (errors.length === 0) return null;
  return errors.length === 1 ? errors[0].message : `${errors[0].message} (${errors.length - 1} more rights problem${errors.length === 2 ? "" : "s"} on this post.)`;
}

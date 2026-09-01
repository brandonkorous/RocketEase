/*
 * What one generated image costs, said BEFORE the button is pressed.
 *
 * Shared by the two surfaces that can spend — the concept card and the library
 * panel — because a figure that differs between them is worse than no figure.
 *
 * The rate is per image, so the aspect does not change it; only the count does,
 * and both surfaces ask for one. Null means no rate is configured, and the
 * surfaces then say nothing rather than implying it is free.
 */
import "server-only";
import { isUnknownCost } from "@rocketease/media";
import { formatUnitEstimate } from "./cost-format";
import { previewJob } from "./jobs";

/** Cost of a single scene_still, formatted, or null when it cannot be priced. */
export function imageUnitEstimate(): string | null {
  // A prompt is required by the spec but does not affect a per-image rate.
  const preview = previewJob({ jobKind: "scene_still", prompt: "estimate", aspect: "1:1", count: 1 });
  if ("error" in preview) return null;
  const cost = preview.estimate;
  if (isUnknownCost(cost)) return null;
  return formatUnitEstimate(cost.amountUsd);
}

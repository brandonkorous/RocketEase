import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { RecommendationRow } from "@/lib/recommendations/store";
import { workspacePath } from "@/lib/nav";
import { RecommendationCard } from "./card";

/**
 * Home pulse: the top few recommendations with their evidence. When nothing has
 * been computed we say why, rather than showing an empty chart.
 */
export function RecommendationsPulse({ workspaceId, recs, hasChannels, hasPublished }: { workspaceId: string; recs: RecommendationRow[]; hasChannels: boolean; hasPublished: boolean }) {
  if (!recs.length) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="h-14 w-20 rounded-lg border border-dashed border-base-300" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-semibold">Not enough data yet</h3>
        <p className="mt-1 max-w-65 text-xs leading-normal text-secondary">
          {!hasChannels
            ? "Connect a channel so insights can be ingested. Recommendations are computed from your own published posts, never from benchmarks."
            : !hasPublished
              ? "Publish a few posts. Once their insights arrive, the nightly pass looks at the last 90 days and explains anything it finds."
              : "Your posts don't yet meet the minimum sample sizes each rule requires. Nothing is shown until the numbers can be defended."}
        </p>
        <Link href={workspacePath(workspaceId, hasChannels ? "create" : "accounts")} className={`${buttonClasses({ color: "primary", size: "sm" })} mt-3`}>{hasChannels ? "Create a post" : "Connect accounts"}</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {recs.map((r) => (<RecommendationCard key={r.id} workspaceId={workspaceId} rec={r} compact />))}
      <Link href={workspacePath(workspaceId, "analytics/recommendations")} className="text-xs font-medium hover:underline">See all recommendations →</Link>
    </div>
  );
}

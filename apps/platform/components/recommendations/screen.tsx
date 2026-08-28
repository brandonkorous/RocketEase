"use client";

import Link from "next/link";
import { Button } from "@wizeworks/silicaui-react";
import type { RecommendationRow } from "@/lib/recommendations/store";
import { recomputeRecommendations } from "@/lib/actions/recommendations";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { RecommendationCard } from "./card";

export type RecommendationsScreenData = {
  workspaceId: string;
  open: RecommendationRow[];
  decided: RecommendationRow[];
  computedLabel: string | null;
  definitionsVersion: string;
  canRecompute: boolean;
  hasChannels: boolean;
};

/** Full recommendations list (analytics.md "Improve"): every card carries its evidence. */
export function RecommendationsScreen({ data }: { data: RecommendationsScreenData }) {
  const { run, pending } = useActionFeedback();
  const { workspaceId } = data;
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <nav className="text-sm text-secondary/70" aria-label="Breadcrumb">
        <Link href={workspacePath(workspaceId, "analytics")} className="hover:underline">Analytics</Link> <span className="mx-1">›</span> <span className="text-base-content">Recommendations</span>
      </nav>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="app-title">Recommendations</h1>
          <p className="mt-1 text-base text-secondary">Computed from this workspace&rsquo;s own stored facts over the last 90 days. Every card shows the numbers behind it and the sample it rests on.</p>
        </div>
        {data.canRecompute && <Button variant="outline" color="neutral" loading={pending} onClick={() => run(() => recomputeRecommendations(workspaceId))}>Recompute</Button>}
      </div>
      <p className="text-xs text-secondary/70">{data.computedLabel ? `Last computed ${data.computedLabel}. ` : "Not computed yet. "}Metric definitions {data.definitionsVersion}. The nightly pass runs at 04:10 UTC; cards expire after 14 days.</p>

      {data.open.length === 0 ? (
        <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-secondary">
          {data.hasChannels
            ? "Nothing to recommend right now. Each rule needs a minimum sample — at least 8 published posts on a channel, 3 per format, or 7 days of facts in each comparison window — before it will say anything."
            : <>No channels connected yet. <Link href={workspacePath(workspaceId, "accounts")} className="font-medium hover:underline">Connect a channel</Link> so insights can be ingested.</>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data.open.map((r) => (<RecommendationCard key={r.id} workspaceId={workspaceId} rec={r} />))}
        </div>
      )}

      {data.decided.length > 0 && (
        <section aria-labelledby="decided-h" className="mt-2">
          <h2 id="decided-h" className="text-sm font-semibold">Dismissed and applied</h2>
          <p className="mt-1 text-xs text-secondary/70">Kept until they expire, so a recompute doesn&rsquo;t bring back advice you already answered.</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {data.decided.map((r) => (<RecommendationCard key={r.id} workspaceId={workspaceId} rec={r} compact />))}
          </div>
        </section>
      )}
    </div>
  );
}

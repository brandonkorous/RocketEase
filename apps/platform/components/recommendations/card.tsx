"use client";

import Link from "next/link";
import { Badge, Button } from "@wizeworks/silicaui-react";
import type { RecommendationRow } from "@/lib/recommendations/store";
import { applyRecommendation, dismissRecommendation } from "@/lib/actions/recommendations";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { EvidenceDetails } from "./evidence";

const CONFIDENCE: Record<string, { label: string; color: "success" | "warning" | "neutral" }> = {
  high: { label: "High confidence", color: "success" },
  medium: { label: "Medium confidence", color: "warning" },
  low: { label: "Low confidence", color: "neutral" },
};

function href(workspaceId: string, action: RecommendationRow["action"]) {
  if (!action) return null;
  const q = new URLSearchParams(action.query ?? {}).toString();
  return `${workspacePath(workspaceId, action.segment)}${q ? `?${q}` : ""}`;
}

/** One recommendation with its evidence. Every number shown comes from `evidence`. */
export function RecommendationCard({ workspaceId, rec, compact = false }: { workspaceId: string; rec: RecommendationRow; compact?: boolean }) {
  const { run, pending } = useActionFeedback();
  const c = CONFIDENCE[rec.confidence] ?? CONFIDENCE.low;
  const link = href(workspaceId, rec.action);
  return (
    <article className="rounded-box border border-base-300 p-4" aria-label={rec.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>{rec.title}</h3>
        <Badge size="xs" variant="soft" color={c.color}>{c.label}</Badge>
      </div>
      <p className={`mt-1 text-secondary ${compact ? "text-xs leading-normal" : "text-sm leading-relaxed"}`}>{rec.body}</p>
      <EvidenceDetails evidence={rec.evidence} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {link && rec.action && <Link href={link} className="btn btn-outline btn-xs">{rec.action.label}</Link>}
        {rec.status === "open" && (
          <>
            <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => applyRecommendation(workspaceId, rec.id))}>Mark applied</Button>
            <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => dismissRecommendation(workspaceId, rec.id))}>Dismiss</Button>
          </>
        )}
        {rec.status !== "open" && <span className="text-xs text-secondary/70">{rec.status === "applied" ? "Marked applied" : "Dismissed"}</span>}
      </div>
    </article>
  );
}

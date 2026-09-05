/*
 * Acceptance — the M12.6 gate between preview and flatten.
 *
 * A render is a preview until a person accepts it. An acceptance covers one
 * PLACEMENT and is stamped with the base variant's current fingerprint, so it
 * has exactly three honest states:
 *
 *   accepted   — the stamp matches the plan as it stands. Flattening may run.
 *   stale      — the plan moved on after acceptance. The draft is reopened;
 *                nothing re-flattens changed work on an old yes.
 *   unaccepted — nobody has said yes to this placement at all.
 *
 * Pure: no database, no session. The actions layer decides who may accept;
 * this file only answers what is and is not accepted right now.
 */
import type { BrandKit } from "@/lib/brand/types";
import type { Placement } from "@/lib/media/canvas/specs";
import { currentFingerprints, renderKey } from "@/lib/media/compose/fingerprint";
import { BASE_VARIANT_ID, type AcceptanceRecord, type AdPlan } from "./types";

export type AcceptanceState = "accepted" | "stale" | "unaccepted";
export type AcceptanceStatus = { placement: Placement; state: AcceptanceState; acceptedAt?: string };

/** The base variant's fingerprint is the one an acceptance stamps and checks. */
const baseFingerprint = (fingerprints: Map<string, string>, placement: Placement): string | null =>
  fingerprints.get(renderKey(placement, BASE_VARIANT_ID)) ?? null;

/** One status per placement the plan currently targets. */
export function acceptanceStatuses(plan: AdPlan, kit: BrandKit | null): AcceptanceStatus[] {
  const fingerprints = currentFingerprints(plan, kit);
  const byPlacement = new Map(plan.acceptances.map((a) => [a.placement, a]));
  return plan.placements.map((placement) => {
    const record = byPlacement.get(placement);
    if (!record) return { placement, state: "unaccepted" as const };
    const current = baseFingerprint(fingerprints, placement);
    return {
      placement,
      state: current !== null && record.fingerprint === current ? ("accepted" as const) : ("stale" as const),
      acceptedAt: record.acceptedAt,
    };
  });
}

/** Of the placements asked for, the ones whose acceptance does not hold right now. */
export function unacceptedFor(plan: AdPlan, kit: BrandKit | null, placements: Placement[]): Placement[] {
  const holds = new Set(
    acceptanceStatuses(plan, kit)
      .filter((s) => s.state === "accepted")
      .map((s) => s.placement),
  );
  return placements.filter((p) => !holds.has(p));
}

/**
 * The plan with an acceptance recorded for each placement at its CURRENT
 * fingerprint. Replaces any earlier record for the same placement — the old
 * stamp is superseded, not history worth keeping (the audit log carries who
 * accepted what, when).
 */
export function withAcceptances(
  plan: AdPlan,
  kit: BrandKit | null,
  placements: Placement[],
  userId: string,
  at = new Date(),
): { plan: AdPlan } | { error: string } {
  const fingerprints = currentFingerprints(plan, kit);
  const records: AcceptanceRecord[] = [];
  for (const placement of placements) {
    const fingerprint = baseFingerprint(fingerprints, placement);
    if (!fingerprint) return { error: `There is nothing renderable for ${placement} yet, so there is nothing to accept.` };
    records.push({ placement, fingerprint, acceptedAt: at.toISOString(), acceptedByUserId: userId });
  }
  const kept = plan.acceptances.filter((a) => !placements.includes(a.placement));
  return { plan: { ...plan, acceptances: [...kept, ...records] } };
}

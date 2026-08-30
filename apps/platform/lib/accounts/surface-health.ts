/*
 * Channel health used to mean "is the token good". A channel whose insights or
 * inbox sync had failed every run for hours still read "Healthy · All systems
 * go", which is the strongest reassurance the screen can give and was false.
 */
import type { StatusTone } from "./types";

export type SurfaceState = { resource: string; lastError: string | null };

const LABEL: Record<string, string> = { insights: "Insights", inbox: "Inbox", ads: "Ads" };

/** Sentences we write ourselves for an expected, handled situation — not a fault. */
const BENIGN = /no longer reports/i;

export type SurfaceHealth = { tone: StatusTone; detail: string } | null;

/**
 * A downgrade only, and only from success: a channel already erroring on its
 * token has a more urgent problem to show, and must not be masked by this.
 */
export function surfaceDowngrade(tone: StatusTone, surfaces: SurfaceState[]): SurfaceHealth {
  if (tone !== "success") return null;
  const failing = surfaces.filter((s) => s.lastError && !BENIGN.test(s.lastError));
  if (!failing.length) return null;
  const names = failing.map((s) => LABEL[s.resource] ?? s.resource);
  return { tone: "warning", detail: `${names.join(" and ")} ${failing.length > 1 ? "are" : "is"} not syncing` };
}

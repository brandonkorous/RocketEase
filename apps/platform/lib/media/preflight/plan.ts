/*
 * Everything knowable about a plan BEFORE a pixel is drawn: rights clocks,
 * clearance, resolution, and the variants that would render a duplicate.
 *
 * Running these first is the point — a rights check that only fires after a
 * render has already cost money and time is a receipt, not a preflight.
 */
import type { BrandKit } from "@/lib/brand/types";
import { specFor, type Placement } from "@/lib/media/canvas/specs";
import type { AdPlan } from "@/lib/media/plan/types";
import { expandVariants } from "@/lib/media/plan/variants";
import { daysUntil, error, warn, type CreativeIssue, type PreflightAsset } from "./types";

const RIGHTS_WARNING_DAYS = 14;

export type PlanPreflightInput = {
  plan: AdPlan;
  kit: BrandKit | null;
  /** Every asset the plan references, by id. A missing entry is itself a finding. */
  assets: Map<string, PreflightAsset>;
  now?: Date;
};

/** Assets that must be usable: the imagery each shot resolved to. */
const referencedAssetIds = (plan: AdPlan): string[] => {
  const ids = new Set<string>();
  for (const shot of plan.shots) if (shot.assetId) ids.add(shot.assetId);
  for (const axis of plan.variants) if (axis.kind === "opening_frame") for (const v of axis.values) ids.add(v);
  return [...ids];
};

function assetIssues(a: PreflightAsset, networks: string[], now: Date): CreativeIssue[] {
  const out: CreativeIssue[] = [];
  if (a.uploadStatus !== "ready") {
    out.push(error("asset_not_ready", `“${a.fileName}” is still ${a.uploadStatus} and can't be used in a render yet.`));
  }
  if (a.scanStatus === "infected") {
    out.push(error("asset_infected", `“${a.fileName}” failed the malware scan and cannot be published.`));
  } else if (a.scanStatus !== "clean") {
    out.push(warn("asset_unscanned", `“${a.fileName}” has not passed a malware scan yet, so it can't be published until it does.`));
  }
  if (a.rightsExpiresAt) {
    const days = daysUntil(a.rightsExpiresAt, now);
    if (days < 0) out.push(error("rights_expired", `The licence on “${a.fileName}” expired ${-days} day${days === -1 ? "" : "s"} ago.`));
    else if (days <= RIGHTS_WARNING_DAYS)
      out.push(warn("rights_expiring", `The licence on “${a.fileName}” expires in ${days} day${days === 1 ? "" : "s"} — before a typical ad flight ends.`));
  }
  if (a.rightsScope === "organic") {
    out.push(error("rights_organic_only", `“${a.fileName}” is licensed for organic posting only. Ad creative is paid usage.`));
  }
  for (const network of networks) {
    if (a.platformClearance[network] === false) {
      out.push(error("not_cleared", `“${a.fileName}” is not cleared for ${network}. Platform music and stock licences rarely travel between networks.`));
    }
  }
  return out;
}

/** Every asset in the plan is checked against every network the plan targets. */
function assetChecks(input: PlanPreflightInput, networks: string[], now: Date): CreativeIssue[] {
  return referencedAssetIds(input.plan).flatMap((id) => {
    const asset = input.assets.get(id);
    if (!asset) return [error("asset_missing", "An image this plan refers to is no longer in the library.")];
    return assetIssues(asset, networks, now);
  });
}

/** A source smaller than the canvas gets enlarged, and enlargement always shows. */
function resolutionChecks(input: PlanPreflightInput): CreativeIssue[] {
  const out: CreativeIssue[] = [];
  for (const placement of input.plan.placements) {
    const spec = specFor(placement);
    for (const shot of input.plan.shots) {
      const a = shot.assetId ? input.assets.get(shot.assetId) : undefined;
      if (!a?.width || !a.height) continue;
      if (a.width < spec.width || a.height < spec.height) {
        out.push(
          warn("low_resolution", `“${a.fileName}” is ${a.width}×${a.height}, smaller than ${spec.label} at ${spec.width}×${spec.height}. It will be enlarged, and that shows.`, { placement }),
        );
      }
    }
  }
  return out;
}

function structureChecks(plan: AdPlan, kit: BrandKit | null): CreativeIssue[] {
  const out: CreativeIssue[] = [];
  if (!plan.shots.some((s) => s.assetId)) {
    out.push(warn("no_imagery", "No image is attached to this plan yet, so every placement renders on a flat brand colour."));
  }
  for (const variant of expandVariants(plan)) {
    if (variant.inert) out.push(warn("inert_variant", `“${variant.label}” would render exactly the same as the base, because ${variant.inert}.`, { variantId: variant.id }));
  }
  for (const o of plan.overlays) {
    if (o.kind === "text" && !o.text.trim()) {
      out.push(warn("empty_overlay", "One text overlay is empty and will be left out of the render.", { overlayId: o.id }));
    }
    if (o.kind === "logo" && !kit?.visual?.logos?.some((l) => l.role === o.logoRole)) {
      out.push(warn("logo_not_in_kit", `The brand kit has no “${o.logoRole}” logo, so that overlay will be skipped.`, { overlayId: o.id }));
    }
  }
  return out;
}

/** Unverified numbers are stated as unverified every time they are used. */
function sourceChecks(placements: Placement[]): CreativeIssue[] {
  return placements.flatMap((placement) => {
    const spec = specFor(placement);
    return spec.verified ? [] : [warn("unverified_spec", `${spec.label}: ${spec.note}`, { placement })];
  });
}

export function preflightPlan(input: PlanPreflightInput): CreativeIssue[] {
  const now = input.now ?? new Date();
  const networks = [...new Set(input.plan.placements.map((p) => specFor(p).network))];
  return [
    ...structureChecks(input.plan, input.kit),
    ...assetChecks(input, networks, now),
    ...resolutionChecks(input),
    ...sourceChecks(input.plan.placements),
  ];
}

/*
 * The rights of a thing made from several things.
 *
 * A cut is only as usable as its most restricted ingredient, and "most
 * restricted" has four independent axes that do not travel together:
 *
 *   scope        organic-only beats both
 *   expiry       the EARLIEST clock wins, whichever asset carries it
 *   licence      a platform-library track poisons the whole cut
 *   clearance    per network, any `false` wins — this is the music trap
 *
 * Picking one "base" asset and inheriting from it gets three of the four wrong
 * whenever the restriction lives on a different ingredient than the scope does.
 *
 * Pure: rows in, a rights envelope out.
 */
import type { LicenseSource, RightsScope } from "@/db/schema/assets";

export type RightsBearing = {
  rightsScope: RightsScope;
  rightsExpiresAt: Date | null;
  licenseSource: LicenseSource;
  platformClearance: Record<string, boolean>;
};

export type MergedRights = {
  rightsScope: RightsScope;
  rightsExpiresAt: Date | null;
  licenseSource: LicenseSource;
  platformClearance: Record<string, boolean>;
};

/** Narrower first. `both` is the permissive end. */
const SCOPE_RANK: Record<RightsScope, number> = { organic: 0, paid: 1, both: 2 };

/**
 * Most restrictive first. A `platform_library` track cannot travel between
 * networks at all, so it dominates anything it is mixed into.
 */
const LICENCE_RANK: Record<LicenseSource, number> = { platform_library: 0, stock: 1, ai_generated: 2, owned: 3 };

export function mergeRights(sources: RightsBearing[]): MergedRights {
  if (!sources.length) {
    return { rightsScope: "both", rightsExpiresAt: null, licenseSource: "owned", platformClearance: {} };
  }

  const rightsScope = sources.reduce<RightsScope>(
    (worst, s) => (SCOPE_RANK[s.rightsScope] < SCOPE_RANK[worst] ? s.rightsScope : worst),
    "both",
  );

  // The earliest real clock. An asset with no expiry does not lift another's.
  const rightsExpiresAt = sources
    .map((s) => s.rightsExpiresAt)
    .filter((d): d is Date => d instanceof Date)
    .reduce<Date | null>((earliest, d) => (earliest === null || d < earliest ? d : earliest), null);

  const licenseSource = sources.reduce<LicenseSource>(
    (worst, s) => (LICENCE_RANK[s.licenseSource] < LICENCE_RANK[worst] ? s.licenseSource : worst),
    "owned",
  );

  // Any explicit `false` blocks that network for the whole cut; a `true` only
  // survives if nothing else contradicts it.
  const platformClearance: Record<string, boolean> = {};
  for (const s of sources) {
    for (const [network, allowed] of Object.entries(s.platformClearance ?? {})) {
      platformClearance[network] = platformClearance[network] === false ? false : allowed;
    }
  }

  return { rightsScope, rightsExpiresAt, licenseSource, platformClearance };
}

/** One line for the render notes, when a merge actually narrowed something. */
export function describeNarrowing(merged: MergedRights, sources: RightsBearing[]): string | null {
  const reasons: string[] = [];
  if (merged.rightsScope !== "both") reasons.push(`${merged.rightsScope} use only`);
  if (merged.licenseSource === "platform_library") reasons.push("a platform-library track that can't travel between networks");
  const blocked = Object.entries(merged.platformClearance).filter(([, ok]) => ok === false).map(([n]) => n);
  if (blocked.length) reasons.push(`not cleared for ${blocked.join(", ")}`);
  if (merged.rightsExpiresAt && sources.some((s) => s.rightsExpiresAt === null)) {
    reasons.push(`rights that expire on ${merged.rightsExpiresAt.toISOString().slice(0, 10)}`);
  }
  return reasons.length ? `This cut inherits the narrowest rights of what went into it: ${reasons.join(", ")}.` : null;
}

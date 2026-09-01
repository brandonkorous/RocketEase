/*
 * Resolving a ReferenceSet, and downsampling it honestly.
 *
 * Reference conditioning is the one primitive the whole 2026 model landscape
 * converged on under different names — Veo "Ingredients" (3), Seedance (9+3+3),
 * Nano Banana Pro (14), Higgsfield "Soul ID". Same feature, different ceilings.
 *
 * Which makes the interesting problem NOT "attach references" but "what happens
 * when the routed model takes three and the plan has seven". Dropping the
 * product packshot to make room for a mood board is the exact failure that
 * produces a warped label on a paid ad, so the priority order is fixed here and
 * every drop is NAMED on the job (docs/media-generation.md §3.2).
 *
 * Pure: takes rows, returns a decision. No database, no storage, no model call.
 */
import type { ModelDescriptor } from "@rocketease/media";
import { referenceCapacity } from "@rocketease/media";
import type { BrandKit, LogoRole } from "@/lib/brand/types";
import { assetLocator, objectLocator, type MediaLocator } from "./locator";

/**
 * What a reference DEPICTS. Distinct from @rocketease/media's `ReferenceRole`,
 * which names the input slot a model exposes (subject, style, ingredient…).
 */
export const REFERENCE_KINDS = ["product", "logo", "style", "talent"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/**
 * Priority, most important first. The product packshot is the fidelity anchor —
 * it is never the reference we drop. Talent is last because it is consent-gated
 * and its absence degrades the shot rather than falsifying the product.
 */
export const REFERENCE_PRIORITY: ReferenceKind[] = ["product", "logo", "style", "talent"];

export type ReferenceRef = { role: ReferenceKind; locator: MediaLocator };

/** What a person asked for, before any model's ceiling is applied. */
export type ReferenceRequest = {
  product: string[];
  style: string[];
  talent: string[];
  /** Picked from the brand kit's 8 logo variants. Resolves to an object, not an asset. */
  logoRole?: LogoRole;
};

export type DroppedReference = { role: ReferenceKind; locatorKey: string; reason: string };

export type ResolvedReferences = {
  refs: ReferenceRef[];
  dropped: DroppedReference[];
  /** Hex values from the brand palette, for models that take a palette parameter. */
  palette: string[];
  /** One line per drop, recorded on the media job so nothing vanishes quietly. */
  notes: string[];
};

/** Brand logos live in object storage under the workspace's brand prefix. */
export function brandLogoLocator(kit: BrandKit | null, role: LogoRole | undefined): MediaLocator | null {
  if (!kit || !role) return null;
  const key = kit.visual?.logos?.find((l) => l.role === role)?.key;
  return key ? objectLocator(key) : null;
}

/** Brand palette as hex, deduped, in the order the kit declares. */
export function paletteOf(kit: BrandKit | null, limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of kit?.visual?.palette ?? []) {
    const hex = s.hex?.trim().toLowerCase();
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
    if (out.length >= limit) break;
  }
  return out;
}

/** The full wish list, in priority order, before any ceiling. */
function requested(req: ReferenceRequest, kit: BrandKit | null): ReferenceRef[] {
  const logo = brandLogoLocator(kit, req.logoRole);
  const byRole: Record<ReferenceKind, MediaLocator[]> = {
    product: req.product.filter(Boolean).map(assetLocator),
    logo: logo ? [logo] : [],
    style: req.style.filter(Boolean).map(assetLocator),
    talent: req.talent.filter(Boolean).map(assetLocator),
  };
  return REFERENCE_PRIORITY.flatMap((role) => byRole[role].map((locator) => ({ role, locator })));
}

const describe = (l: MediaLocator) => (l.kind === "asset" ? `asset:${l.assetId}` : `object:${l.storageKey}`);

/**
 * Take what the model can hold, in priority order; name what did not fit.
 * A model that accepts no references at all is not an error — it is a fact the
 * caller needs stated, because it changes what the output can be trusted for.
 */
export function resolveReferences(
  req: ReferenceRequest,
  model: ModelDescriptor,
  kit: BrandKit | null,
): ResolvedReferences {
  const wanted = requested(req, kit);
  const capacity = referenceCapacity(model.io).images;
  const refs = wanted.slice(0, capacity);
  const overflow = wanted.slice(capacity);

  const reason =
    capacity === 0
      ? `${model.label} does not accept reference images`
      : `${model.label} accepts ${capacity} reference image${capacity === 1 ? "" : "s"}, and these ranked below the ones that fit`;

  const dropped: DroppedReference[] = overflow.map((r) => ({ role: r.role, locatorKey: describe(r.locator), reason }));

  const notes: string[] = [];
  if (dropped.length) {
    const roles = [...new Set(dropped.map((d) => d.role))].join(", ");
    notes.push(`${dropped.length} reference${dropped.length === 1 ? "" : "s"} dropped (${roles}) — ${reason}.`);
  }
  // The one drop worth shouting about: nothing anchors the product's appearance.
  if (req.product.length && !refs.some((r) => r.role === "product")) {
    notes.push("No product reference reached the model, so the product's appearance is not anchored to a real photograph.");
  }

  return { refs, dropped, palette: paletteOf(kit), notes };
}

/** True when the product survived to the model — the fidelity precondition. */
export const productAnchored = (r: ResolvedReferences): boolean => r.refs.some((x) => x.role === "product");

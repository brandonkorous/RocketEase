/*
 * Rendering one (plan, variant, placement) into a library asset.
 *
 * Fetch → composite → judge → store, in that order. The preflight runs against
 * the render that actually happened, not against an intention, which is the
 * whole reason we draw the type ourselves.
 *
 * Idempotent by construction: compositing is deterministic, so a retry produces
 * the same pixels. It writes a NEW asset each time rather than mutating one,
 * because the previous render may already be attached to a published post.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset, type Asset } from "@/db/schema/assets";
import { contentItem } from "@/db/schema/content";
import { loadBrandKit } from "@/lib/brand/load";
import { getObjectBuffer } from "@/lib/storage";
import { isPlacement, type Placement } from "./canvas/specs";
import { renderAd } from "./compose/render";
import { fingerprint } from "./compose/fingerprint";
import { resolveRenderSpec, type RenderSpec } from "./compose/spec";
import { readPlan } from "./plan/schema";
import { variantById } from "./plan/variants";
import type { CreativeIssue } from "./preflight";
import { preflightRender } from "./preflight";
import { savePlan, withRender, writeCompositeAsset, type RenderActor } from "./render-store";

export type RenderJobInput = { contentItemId: string; placement: string; variantId: string };
export type RenderJobResult = { assetId: string; issues: CreativeIssue[] } | { error: string };

/** Bytes for the base image and every logo overlay. A miss is reported, not fatal. */
async function fetchLayers(spec: RenderSpec, base: Asset | null) {
  const logos: Record<string, Buffer> = {};
  for (const l of spec.logos) {
    if (l.locator.kind !== "object") continue;
    try {
      logos[l.id] = await getObjectBuffer(l.locator.storageKey);
    } catch {
      // Left out; renderAd records `logo_missing` and preflight surfaces it.
    }
  }
  let baseBytes: Buffer | null = null;
  if (base) {
    try {
      baseBytes = await getObjectBuffer(base.storageKey);
    } catch {
      baseBytes = null;
    }
  }
  return { baseBytes, logos };
}

const fileNameFor = (placement: Placement, variantId: string, extension: string) =>
  `ad-${placement}-${variantId.replace(/[^a-z0-9]+/gi, "-")}${extension}`;

type Loaded = { item: typeof contentItem.$inferSelect; spec: RenderSpec; base: Asset | null; actor: RenderActor };

async function load(input: RenderJobInput): Promise<Loaded | { error: string }> {
  if (!isPlacement(input.placement)) return { error: `Unknown placement “${input.placement}”.` };
  const [item] = await db.select().from(contentItem).where(eq(contentItem.id, input.contentItemId));
  if (!item) return { error: "That draft no longer exists." };

  const plan = readPlan(item.adPlan);
  if (!plan) return { error: "This draft has no ad plan, or the stored plan could not be read." };

  const variant = variantById(plan, input.variantId);
  if (!variant) return { error: `This plan has no variant “${input.variantId}”.` };
  if (variant.inert) return { error: `“${variant.label}” would render the same as the base, because ${variant.inert}.` };

  const kit = await loadBrandKit(item.workspaceId);
  const spec = resolveRenderSpec({ variant, placement: input.placement, kit });

  // WORKSPACE-SCOPED, always. A plan is jsonb, so it can name any asset id at
  // all; an unscoped lookup here would composite another tenant's photograph.
  let base: Asset | null = null;
  if (spec.base?.kind === "asset") {
    const [row] = await db
      .select()
      .from(asset)
      .where(and(eq(asset.id, spec.base.assetId), eq(asset.workspaceId, item.workspaceId), isNull(asset.deletedAt)));
    base = row ?? null;
  }
  return {
    item,
    spec,
    base,
    actor: { organizationId: item.organizationId, workspaceId: item.workspaceId, userId: item.ownerUserId },
  };
}

export async function renderPlanVariant(input: RenderJobInput): Promise<RenderJobResult> {
  const loaded = await load(input);
  if ("error" in loaded) return loaded;
  const { item, spec, base, actor } = loaded;

  const { baseBytes, logos } = await fetchLayers(spec, base);
  const result = await renderAd({ spec, base: baseBytes, logos });
  const issues = preflightRender(spec, result);

  const assetId = await writeCompositeAsset({
    actor,
    base,
    result,
    fileName: fileNameFor(spec.placement, spec.variantId, result.extension),
    altText: spec.texts.map((t) => t.text).join(". ") || null,
  });

  // Re-read: the plan may have been edited while this render was in flight, and
  // the stored plan is authoritative over the copy this job started with.
  const [fresh] = await db.select({ adPlan: contentItem.adPlan }).from(contentItem).where(eq(contentItem.id, item.id));
  const current = readPlan(fresh?.adPlan);
  if (current) {
    await savePlan(
      item.id,
      withRender(current, {
        placement: spec.placement,
        variantId: spec.variantId,
        assetId,
        fingerprint: fingerprint(spec),
        renderedAt: new Date().toISOString(),
      }),
    );
  }

  return { assetId, issues };
}

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { importSource } from "@/db/schema/imports";
import { audit } from "@/lib/audit";
import { listCanvaDesigns, MIME, type ImportFormat } from "@/lib/import/canva";
import { accessTokenFor, ownSource } from "@/lib/import/sources";
import { emit } from "@/lib/jobs/outbox";
import { workspacePath } from "@/lib/nav";
import { requireCapability } from "@/lib/session";
import { newObjectKey } from "@/lib/storage";
import { fail, guard, type ActionState } from "./content/shared";

export type CanvaDesignRow = { id: string; title: string; thumbUrl: string | null; pages: number; updatedAt: string | null };
export type CanvaPick = { id: string; title: string; pages: number };

const MAX_DESIGNS = 20;
/** A carousel is at most ten slides on every network the composer serves; more pages than that stay in Canva. */
const MAX_PAGES = 10;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "canva-design";

/** A page of the person's own Canva designs, newest first, or the search's best matches. */
export async function canvaDesigns(workspaceId: string, opts: { query?: string; continuation?: string } = {}): Promise<ActionState & { items?: CanvaDesignRow[]; continuation?: string | null }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const source = await ownSource(workspaceId, ctx.session.user.id);
    if (!source) return fail("Connect your Canva account first.");
    const page = await listCanvaDesigns(await accessTokenFor(source.id), opts);
    const items = page.items.map((d) => ({ id: d.id, title: d.title?.trim() || "Untitled design", thumbUrl: d.thumbnail?.url ?? null, pages: Math.max(1, d.page_count ?? 1), updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null }));
    return { ok: "", items, continuation: page.continuation ?? null };
  });
}

/**
 * Reserve one asset row per page (in page order) and queue the export. The
 * rows are `pending` until the worker writes the bytes; rights are the
 * person's own (they made the design) and the source is on the record.
 */
export async function importCanvaDesigns(workspaceId: string, picks: CanvaPick[], format: ImportFormat): Promise<ActionState & { assets?: number }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const source = await ownSource(workspaceId, ctx.session.user.id);
    if (!source) return fail("Connect your Canva account first.");
    const chosen = picks.filter((p) => p.id && p.title != null).slice(0, MAX_DESIGNS);
    if (!chosen.length) return fail("Pick at least one design.");
    if (format !== "png" && format !== "jpg") return fail("Choose PNG or JPG.");
    const org = ctx.workspace.organizationId;
    let count = 0;
    for (const pick of chosen) {
      const pages = Math.min(MAX_PAGES, Math.max(1, Math.floor(pick.pages || 1)));
      const title = pick.title.trim().slice(0, 200) || "Untitled design";
      await db.transaction(async (tx) => {
        const ids: string[] = [];
        for (let i = 0; i < pages; i++) {
          const fileName = `${slug(title)}${pages > 1 ? `-page-${i + 1}` : ""}.${format}`;
          const [row] = await tx
            .insert(asset)
            .values({ organizationId: org, workspaceId, kind: "image", storageKey: newObjectKey(org, workspaceId, "original", fileName), fileName, mimeType: MIME[format], bytes: null, title: pages > 1 ? `${title} (${i + 1}/${pages})` : title, uploadedByUserId: ctx.session.user.id, uploadStatus: "pending", licenseSource: "owned", rightsNote: `Imported from Canva design “${title}” (${source.name})`, provenance: { c2pa: "absent", watermark: null, chain: [{ action: "import_requested", adapter: "canva", ref: pick.id, detail: `design “${title}”` }] } })
            .returning({ id: asset.id });
          ids.push(row.id);
        }
        await emit(tx, "import.canva", { sourceId: source.id, designId: pick.id, assetIds: ids, format }, { organizationId: org, workspaceId, dedupeKey: `import.canva:${ids[0]}` });
        count += ids.length;
      });
      await audit({ action: "asset.import", actorUserId: ctx.session.user.id, organizationId: org, workspaceId, targetType: "asset", targetId: pick.id, summary: { after: { source: "canva", design: title, pages, format } } });
    }
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: `Importing ${count} file${count === 1 ? "" : "s"} from Canva. They appear here as they arrive.`, assets: count };
  });
}

/** Forget the person's Canva link. Files already imported stay; only the credential goes. */
export async function disconnectCanva(workspaceId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const source = await ownSource(workspaceId, ctx.session.user.id);
    if (!source) return fail("Canva is not connected.");
    await db.update(importSource).set({ status: "disconnected", secret: null, disconnectedAt: new Date(), updatedAt: new Date() }).where(eq(importSource.id, source.id));
    await audit({ action: "import.disconnected", actorUserId: ctx.session.user.id, organizationId: source.organizationId, workspaceId, targetType: "import_source", targetId: source.id, summary: { before: { kind: "canva", name: source.name } } });
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: "Canva disconnected." };
  });
}

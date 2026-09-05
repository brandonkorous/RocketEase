/*
 * The brand kit as a document a client or a freelancer can keep: the kit's
 * words, its logos inlined as data URIs (no external requests, like the
 * reports), and who prepared it. Built here, rendered in ./render.tsx, served
 * by app/app/[workspaceId]/brand/export/route.ts.
 */
import "server-only";
import { loadBranding, logoDataUri } from "@/lib/reports/branding";
import { dayKey, formatInZone } from "@/lib/time";
import { loadBrandKit } from "../store";
import { LOGO_LABEL } from "../types";
import { brandAssetCards } from "../views";
import type { BrandDocument } from "./document";

export type { BrandDocument } from "./document";

export type ExportWorkspace = { id: string; name: string; organizationId: string; timezone: string };

export async function buildBrandDocument(ws: ExportWorkspace, now = new Date()): Promise<BrandDocument> {
  const kit = await loadBrandKit(ws.id);
  const [branding, logos, assets] = await Promise.all([
    loadBranding(ws.organizationId),
    Promise.all(kit.visual.logos.map(async (l) => ({ role: l.role, label: LOGO_LABEL[l.role], dataUri: await logoDataUri(l.key), note: l.note }))),
    brandAssetCards(ws.id, kit.assets.assetIds, now),
  ]);
  const name = kit.identity.displayName || ws.name;
  return {
    meta: { title: `${name} brand kit`, workspaceName: ws.name, generatedAt: formatInZone(now, ws.timezone), timezone: ws.timezone, today: dayKey(now, ws.timezone) },
    preparedBy: { name: branding.agencyName || ws.name, logo: await logoDataUri(branding.logoKey) },
    kit,
    logos,
    assets: assets.map((a) => ({ title: a.title, size: a.size, rights: a.rights ?? "Rights: not recorded" })),
  };
}

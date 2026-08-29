import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { NETWORK_LABEL } from "@/components/composer/types";
import type { NetworkOption } from "@/components/brand/channels-form";
import { aiConfigured } from "@/lib/ai/client";
import { readRequireAiDisclosure } from "@/lib/disclosure";
import { EMPTY_KIT } from "@/lib/brand/read";
import type { BrandSection } from "@/lib/brand/schema";
import { loadBrandKit, loadWorkspaceSettings } from "@/lib/brand/store";
import { libraryCards, logoViews } from "@/lib/brand/views";
import type { AssetView, LogoView } from "@/lib/brand/view-types";
import type { BrandKit } from "@/lib/brand/types";

export type BrandSectionData = {
  kit: BrandKit;
  aiEnabled: boolean;
  logos: LogoView[];
  networks: NetworkOption[];
  library: AssetView[];
  requireAiDisclosure: boolean;
};

const EMPTY: BrandSectionData = { kit: EMPTY_KIT, aiEnabled: false, logos: [], networks: [], library: [], requireAiDisclosure: false };

async function networkOptions(workspaceId: string): Promise<NetworkOption[]> {
  const rows = await db.selectDistinct({ network: channel.network }).from(channel).where(eq(channel.workspaceId, workspaceId));
  return rows.map((r) => ({ network: r.network, label: NETWORK_LABEL[r.network] ?? r.network })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Loads only what the requested section renders. */
export async function loadBrandSection(section: BrandSection, workspaceId: string): Promise<BrandSectionData> {
  const kit = await loadBrandKit(workspaceId);
  const data: BrandSectionData = { ...EMPTY, kit };
  if (section === "voice") data.aiEnabled = aiConfigured();
  if (section === "visual") data.logos = await logoViews(kit);
  if (section === "channels") data.networks = await networkOptions(workspaceId);
  if (section === "assets") data.library = await libraryCards(workspaceId, kit.assets.assetIds, new Date());
  if (section === "rules") data.requireAiDisclosure = readRequireAiDisclosure((await loadWorkspaceSettings(workspaceId)) ?? {});
  return data;
}

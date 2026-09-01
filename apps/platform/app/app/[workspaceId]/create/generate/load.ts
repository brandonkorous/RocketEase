import "server-only";
import type { GeneratorChannel, SavedBriefView } from "@/components/generator";
import { NETWORK_LABEL } from "@/components/composer/types";
import { aiConfigured } from "@/lib/ai/client";
import { adCapable } from "@/lib/ai/generator/ads";
import { listBriefs } from "@/lib/ai/generator/briefs";
import { canGenerate } from "@/lib/media/jobs";
import { imageUnitEstimate } from "@/lib/media/estimate";
import { loadBrandKit } from "@/lib/brand/store";
import { publishableChannels } from "@/lib/content";
import { hasCapability, type WorkspaceContext } from "@/lib/session";

export type GeneratorLoad =
  | { kind: "no_capability" }
  | { kind: "no_channels" }
  | { kind: "unconfigured"; imagesEnabled: boolean }
  | { kind: "ready"; channels: GeneratorChannel[]; savedBriefs: SavedBriefView[]; imagesEnabled: boolean; imageEstimate: string | null; brand: { configured: boolean; styled: boolean } };

export async function loadGenerator(ctx: WorkspaceContext): Promise<GeneratorLoad> {
  const workspaceId = ctx.workspace.id;
  if (!hasCapability(ctx.workspace, "content.create")) return { kind: "no_capability" };
  const rows = await publishableChannels(workspaceId);
  if (rows.length === 0) return { kind: "no_channels" };
  // Images are a DIFFERENT model behind a different key; report them separately.
  if (!aiConfigured()) return { kind: "unconfigured", imagesEnabled: canGenerate("scene_still") };

  const channels: GeneratorChannel[] = rows.map((c) => ({
    id: c.id,
    provider: c.provider,
    kind: c.kind,
    network: c.network,
    networkLabel: NETWORK_LABEL[c.network] ?? c.network,
    name: c.name,
    adCapable: adCapable(c.network, c.capabilities),
    textMax: c.capabilities.limits.textMaxChars ?? null,
    hashtagsMax: c.capabilities.limits.hashtagsMax ?? null,
  }));
  const savedBriefs = (await listBriefs(workspaceId)).map((b) => ({ id: b.id, name: b.name, brief: b.brief }));
  const kit = await loadBrandKit(ctx.workspace.id);
  const brand = {
    configured: Boolean(kit.voice.tone || kit.identity.oneLiner || kit.messaging.valueProps.length),
    styled: Boolean(kit.visual.imagery.style || kit.visual.palette.length),
  };
  return { kind: "ready", channels, savedBriefs, imagesEnabled: canGenerate("scene_still"), imageEstimate: await imageUnitEstimate(workspaceId), brand };
}

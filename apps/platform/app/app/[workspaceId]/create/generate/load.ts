import "server-only";
import type { GeneratorChannel, SavedBriefView } from "@/components/generator";
import { NETWORK_LABEL } from "@/components/composer/types";
import { aiConfigured } from "@/lib/ai/client";
import { adCapable } from "@/lib/ai/generator/ads";
import { listBriefs } from "@/lib/ai/generator/briefs";
import { imagesConfigured } from "@/lib/ai/generator/images";
import { publishableChannels } from "@/lib/content";
import { hasCapability, type WorkspaceContext } from "@/lib/session";

export type GeneratorLoad =
  | { kind: "no_capability" }
  | { kind: "no_channels" }
  | { kind: "unconfigured" }
  | { kind: "ready"; channels: GeneratorChannel[]; savedBriefs: SavedBriefView[]; imagesEnabled: boolean };

export async function loadGenerator(ctx: WorkspaceContext): Promise<GeneratorLoad> {
  const workspaceId = ctx.workspace.id;
  if (!hasCapability(ctx.workspace, "content.create")) return { kind: "no_capability" };
  const rows = await publishableChannels(workspaceId);
  if (rows.length === 0) return { kind: "no_channels" };
  if (!aiConfigured()) return { kind: "unconfigured" };

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
  return { kind: "ready", channels, savedBriefs, imagesEnabled: imagesConfigured() };
}

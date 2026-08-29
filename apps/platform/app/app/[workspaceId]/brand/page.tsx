import { AssetsCard, LogosCard, PaletteCard, TypographyCard } from "@/components/brand/overview/visual-cards";
import { AudiencesCard, IdentityCard, MessagingCard, RulesCard, VoiceCard } from "@/components/brand/overview/kit-cards";
import { ChannelsCard, Completeness, Warnings } from "@/components/brand/overview/summary";
import { brandHealth, brandWarnings } from "@/lib/brand/health";
import { loadBrandKit } from "@/lib/brand/store";
import { brandAssetCards, logoViews } from "@/lib/brand/views";
import { requireWorkspace } from "@/lib/session";
import { dayKey } from "@/lib/time";

/** The kit at a glance: one card per section, each showing what is actually in it. */
export default async function BrandOverview({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const now = new Date();
  const today = dayKey(now, ctx.workspace.timezone);
  const kit = await loadBrandKit(workspaceId);
  const [logos, assets] = await Promise.all([logoViews(kit), brandAssetCards(workspaceId, kit.assets.assetIds, now)]);

  return (
    <div>
      <Completeness health={brandHealth(kit)} />
      <Warnings workspaceId={workspaceId} warnings={brandWarnings(kit, today)} />
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <IdentityCard workspaceId={workspaceId} kit={kit} />
        <VoiceCard workspaceId={workspaceId} kit={kit} />
        <LogosCard workspaceId={workspaceId} logos={logos} />
        <PaletteCard workspaceId={workspaceId} visual={kit.visual} />
        <TypographyCard workspaceId={workspaceId} visual={kit.visual} />
        <MessagingCard workspaceId={workspaceId} kit={kit} today={today} />
        <AudiencesCard workspaceId={workspaceId} kit={kit} />
        <RulesCard workspaceId={workspaceId} kit={kit} />
        <AssetsCard workspaceId={workspaceId} assets={assets} links={kit.assets.links.length} />
        <ChannelsCard workspaceId={workspaceId} kit={kit} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { RecommendationsScreen } from "@/components/recommendations/screen";
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { listRecommendations } from "@/lib/recommendations/store";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Recommendations" };

export default async function Page({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { workspace } = await requireWorkspace(workspaceId);
  const [open, decided, [{ n: channels }]] = await Promise.all([
    listRecommendations(workspaceId, { statuses: ["open"] }),
    listRecommendations(workspaceId, { statuses: ["dismissed", "applied"], limit: 20 }),
    db.select({ n: count() }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))),
  ]);
  const latest = [...open, ...decided].reduce<Date | null>((m, r) => (!m || r.computedAt > m ? r.computedAt : m), null);
  return (
    <RecommendationsScreen
      data={{
        workspaceId,
        open,
        decided,
        computedLabel: latest ? formatInZone(latest, workspace.timezone) : null,
        definitionsVersion: DEFINITIONS_VERSION,
        canRecompute: hasCapability(workspace, "analytics.view"),
        hasChannels: Number(channels) > 0,
      }}
    />
  );
}

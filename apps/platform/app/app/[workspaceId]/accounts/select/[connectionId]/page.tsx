import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppPage, PageHeader } from "@/components/page-frame";
import { ChannelSelectForm } from "@/components/channel-select-form";
import { db } from "@/db";
import { getAdapter, loadCredential } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Choose accounts" };

export default async function SelectChannelsPage({ params }: { params: Promise<{ workspaceId: string; connectionId: string }> }) {
  const { workspaceId, connectionId } = await params;
  const ctx = await requireCapability(workspaceId, "channels.manage");
  const conn = await db.query.providerConnection.findFirst({ where: (c, { and, eq }) => and(eq(c.id, connectionId), eq(c.workspaceId, workspaceId)) });
  if (!conn) redirect(workspacePath(workspaceId, "accounts"));

  const adapter = getAdapter(conn.provider);
  let available: Awaited<ReturnType<typeof adapter.listChannels>> = [];
  let error: string | null = null;
  try {
    available = await adapter.listChannels(await loadCredential(conn));
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load accounts";
  }
  const already = await db.query.channel.findMany({ where: (c, { and, eq }) => and(eq(c.connectionId, conn.id), eq(c.workspaceId, workspaceId)) });
  const alreadyKeys = new Set(already.filter((c) => c.status !== "disconnected").map((c) => `${c.kind}:${c.remoteId}`));

  return (
    <AppPage>
      <PageHeader
        title={`Choose accounts for ${ctx.workspace.name}`}
        description={`${adapter.displayName} · signed in as ${conn.providerUserName ?? conn.providerUserId}. Only the accounts you pick join this workspace.`}
      />
      <ChannelSelectForm
        workspaceId={workspaceId}
        connectionId={conn.id}
        error={error}
        channels={available.map((c) => ({
          key: `${c.kind}:${c.remoteId}`,
          network: c.network,
          kind: c.kind,
          name: c.name,
          handle: c.handle ?? null,
          avatarUrl: c.avatarUrl ?? null,
          publishable: c.capabilities.formats.length > 0,
          reason: c.capabilities.reasons?.formats ?? null,
          formats: c.capabilities.formats,
          inbox: c.capabilities.inbox.comments || c.capabilities.inbox.messages,
          already: alreadyKeys.has(`${c.kind}:${c.remoteId}`),
        }))}
      />
    </AppPage>
  );
}

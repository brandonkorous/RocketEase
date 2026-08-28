import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import { AccountsPanel, type ConnectionRow } from "@/components/accounts-panel";
import { QueryToast } from "@/components/query-toast";
import { db } from "@/db";
import { channel, providerConnection } from "@/db/schema/connections";
import { providers } from "@/lib/providers";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Connected accounts" };

const ERRORS: Record<string, string> = {
  cancelled: "You cancelled at the network. Nothing was connected.",
  forbidden: "Only workspace owners and admins can connect accounts.",
  oauth_state: "That sign-in link expired or was already used. Start again.",
  permission: "The network refused the connection. Check you granted the requested permissions.",
  reconnect_identity: "That's a different network account than the one you're reconnecting. Sign in with the original account.",
  exchange_failed: "The network didn't complete the sign-in. Try again in a moment.",
};

export default async function AccountsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);
  const canManage = hasCapability(ctx.workspace, "channels.manage");

  const conns = await db.select().from(providerConnection).where(eq(providerConnection.workspaceId, workspaceId)).orderBy(desc(providerConnection.createdAt));
  const chans = await db.select().from(channel).where(eq(channel.workspaceId, workspaceId)).orderBy(channel.name);
  const reg = providers();

  const rows: ConnectionRow[] = conns
    .filter((c) => c.status !== "selecting")
    .map((c) => ({
      id: c.id,
      provider: c.provider,
      providerName: reg.get(c.provider)?.displayName ?? c.provider,
      providerUserName: c.providerUserName,
      status: c.status,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      scopes: c.scopes,
      channels: chans
        .filter((ch) => ch.connectionId === c.id)
        .map((ch) => ({
          id: ch.id,
          network: ch.network,
          kind: ch.kind,
          name: ch.name,
          handle: ch.handle,
          avatarUrl: ch.avatarUrl,
          status: ch.status,
          healthMessage: ch.health.message ?? null,
          lastSyncAt: ch.lastSyncAt?.toISOString() ?? null,
          formats: ch.capabilities.formats,
          inbox: ch.capabilities.inbox.comments || ch.capabilities.inbox.messages,
          insights: ch.capabilities.insights.organic,
        })),
    }))
    .filter((c) => c.channels.length > 0 || c.status !== "disconnected");

  const providerOptions = [...reg.values()].map((p) => ({ key: p.key, displayName: p.displayName, networks: p.networks, accessSummary: p.accessSummary }));
  const notice = sp.connected ? "Accounts added. We're checking permissions and capabilities now." : sp.error ? (ERRORS[sp.error] ?? `Connection failed (${sp.error}).`) : null;

  return (
    <AppPage>
      <PageHeader title="Connected accounts" description="Social profiles, pages, and ad accounts with their permissions and health." />
      {rows.length === 0 && providerOptions.length === 0 ? (
        <PageEmpty
          title="No networks are enabled in this deployment"
          description="Provider credentials (Meta, LinkedIn, TikTok) are not configured. In development set PROVIDERS_ENABLE_MOCK=1 to use the demo network."
          primary={{ label: "Back to Home", href: workspacePath(workspaceId, "home") }}
        />
      ) : (
        <>
          <QueryToast ok={sp.connected ? notice : null} error={sp.error ? notice : null} />
          <AccountsPanel workspaceId={workspaceId} connections={rows} providers={providerOptions} canManage={canManage} />
        </>
      )}
    </AppPage>
  );
}

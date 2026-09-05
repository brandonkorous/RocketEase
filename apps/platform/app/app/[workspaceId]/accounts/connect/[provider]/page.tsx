import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppPage, PageHeader } from "@/components/page-frame";
import { CredentialsConnectForm } from "@/components/accounts/credentials-form";
import { getAdapter, isProviderKey } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Sign in to a network" };

/**
 * Sign-in for a network that has no OAuth (Bluesky app passwords). Reached from
 * the same "Connect account" menu as every other network; the start route sends
 * credential-based adapters here instead of to a consent screen.
 */
export default async function ConnectWithCredentialsPage({ params, searchParams }: { params: Promise<{ workspaceId: string; provider: string }>; searchParams: Promise<{ reconnect?: string; next?: string }> }) {
  const [{ workspaceId, provider }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireCapability(workspaceId, "channels.manage");
  if (!isProviderKey(provider)) redirect(`${workspacePath(workspaceId, "accounts")}?error=unknown_provider`);
  const adapter = getAdapter(provider);
  if (!adapter.credentialsForm || !adapter.signIn) redirect(`/api/connect/${provider}/start?workspaceId=${workspaceId}`);
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : null;

  return (
    <AppPage>
      <PageHeader title={`Connect ${adapter.displayName} to ${ctx.workspace.name}`} description="Only the account you sign in with joins this workspace, and only after you confirm it on the next step." />
      <CredentialsConnectForm workspaceId={workspaceId} provider={provider} network={adapter.networks[0] ?? provider} displayName={adapter.displayName} form={adapter.credentialsForm} reconnect={sp.reconnect ?? null} next={next} />
    </AppPage>
  );
}

import type { Metadata } from "next";
import { accountsData } from "@/lib/accounts/screen";
import { AccountsScreen } from "@/components/accounts/screen";
import { QueryToast } from "@/components/query-toast";
import { requireWorkspace } from "@/lib/session";

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
  const data = await accountsData(ctx);
  const notice = sp.connected ? "Accounts added. We're checking permissions and capabilities now." : sp.error ? (ERRORS[sp.error] ?? `Connection failed (${sp.error}).`) : null;

  return (
    <>
      <QueryToast ok={sp.connected ? notice : null} error={sp.error ? notice : null} />
      <AccountsScreen data={data} />
    </>
  );
}

import type { Metadata } from "next";
import { InboxScreen } from "@/components/inbox-screen";
import { loadInboxData } from "@/lib/engagement/screen";

export const metadata: Metadata = { title: "Inbox" };

export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadInboxData(workspaceId, sp);
  return <InboxScreen data={data} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InboxScreen } from "@/components/inbox-screen";
import { loadInboxData } from "@/lib/engagement/screen";

export const metadata: Metadata = { title: "Conversation" };

export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string; conversationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId, conversationId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadInboxData(workspaceId, sp, conversationId);
  if (!data.detail) notFound();
  return <InboxScreen data={data} />;
}

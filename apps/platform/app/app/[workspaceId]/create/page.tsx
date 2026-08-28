import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Composer } from "@/components/composer";
import { requireWorkspace } from "@/lib/session";
import { NoCapability, NoChannels } from "./empty-states";
import { loadComposer, type CreateSearch } from "./load";

export const metadata: Metadata = { title: "Create post" };

export default async function CreatePage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<CreateSearch> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);
  const r = await loadComposer(ctx, sp, "create");
  if (r.kind === "redirect") redirect(r.to);
  if (r.kind === "no_capability") return <NoCapability workspaceId={workspaceId} />;
  if (r.kind === "no_channels") return <NoChannels workspaceId={workspaceId} />;
  return <Composer {...r.props} />;
}

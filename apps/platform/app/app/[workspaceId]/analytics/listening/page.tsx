import type { Metadata } from "next";
import { ListeningScreen } from "@/components/listening/screen";
import { listeningScreen } from "@/lib/listening/screen";
import { hasCapability, requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Listening" };

type SP = { query?: string; network?: string; page?: string; view?: string };

/** Listening + ad library (M14.11), under Analytics; mockup: docs/plans/m14.11-listening.md. */
export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<SP> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(workspaceId);
  const data = await listeningScreen({ workspaceId, timezone: workspace.timezone, canEdit: hasCapability(workspace, "content.create"), sp });
  return <ListeningScreen data={data} />;
}

/*
 * The plan editor (M12.6 WP3): form on the left, layered preview on the right.
 * A render is a preview until a person accepts it; edits to owned layers cost
 * nothing and say so.
 */
import { notFound } from "next/navigation";
import { PlanEditor } from "@/components/plan-editor";
import { loadPlanEditor } from "./load";

export default async function PlanEditorPage({ params }: { params: Promise<{ workspaceId: string; contentItemId: string }> }) {
  const { workspaceId, contentItemId } = await params;
  const loaded = await loadPlanEditor(workspaceId, contentItemId);
  // Outside the beta the route is absent, not locked; a missing draft is a 404.
  if (loaded.kind !== "ok") notFound();
  return <PlanEditor data={loaded.data} />;
}

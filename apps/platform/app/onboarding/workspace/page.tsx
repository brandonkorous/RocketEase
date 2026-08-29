import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { NewWorkspaceForm } from "@/components/new-workspace-form";
import { GuidancePanel } from "@/components/onboarding/step-panel";
import { SplitShell } from "@/components/split-shell";

export const metadata: Metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  await requireUser();
  const orgs = await auth.api.listOrganizations({ headers: await headers() });
  if (!orgs?.length) redirect("/onboarding");

  return (
    <SplitShell
      panel={<GuidancePanel topic="new-workspace" label="About workspaces" />}
      header={<Link href="/" className="shrink-0 text-sm font-medium underline-offset-2 hover:underline">Cancel</Link>}
      align="start"
      width="max-w-120"
    >
      <NewWorkspaceForm organizations={orgs.map((o) => ({ id: o.id, name: o.name }))} />
    </SplitShell>
  );
}

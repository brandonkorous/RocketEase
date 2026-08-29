import type { Metadata } from "next";
import { GeneratorScreen } from "@/components/generator";
import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import { workspacePath } from "@/lib/nav";
import { requireWorkspace } from "@/lib/session";
import { NoCapability, NoChannels } from "../empty-states";
import { loadGenerator } from "./load";

export const metadata: Metadata = { title: "Generate" };

export default async function GeneratePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const r = await loadGenerator(ctx);
  if (r.kind === "no_capability") return <NoCapability workspaceId={workspaceId} />;
  if (r.kind === "no_channels") return <NoChannels workspaceId={workspaceId} />;
  if (r.kind === "unconfigured") return <Unconfigured workspaceId={workspaceId} />;
  return <GeneratorScreen workspaceId={workspaceId} channels={r.channels} savedBriefs={r.savedBriefs} imagesEnabled={r.imagesEnabled} />;
}

/** Honest, not hidden: the feature exists and is switched off, and we say so. */
function Unconfigured({ workspaceId }: { workspaceId: string }) {
  return (
    <AppPage>
      <PageHeader title="Generate" />
      <PageEmpty
        title="AI drafting isn't configured"
        description="This deployment has no model key set, so nothing can be generated. Everything else in Create works as usual — write the post yourself and publish it."
        primary={{ label: "Open Create", href: workspacePath(workspaceId, "create") }}
        secondary={{ label: "Back to Home", href: workspacePath(workspaceId, "home") }}
      />
    </AppPage>
  );
}

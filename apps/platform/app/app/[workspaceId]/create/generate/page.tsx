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
  if (r.kind === "unconfigured") return <Unconfigured workspaceId={workspaceId} imagesEnabled={r.imagesEnabled} />;
  return <GeneratorScreen workspaceId={workspaceId} channels={r.channels} savedBriefs={r.savedBriefs} imagesEnabled={r.imagesEnabled} imageEstimate={r.imageEstimate} brand={r.brand} />;
}

/**
 * Honest, not hidden: the feature exists and is switched off, and we say so.
 *
 * It also says what STILL works. Drafting and image generation are different
 * vendors behind different keys, so "no text model" does not mean "no images" —
 * and this screen used to imply it did, because the only Generate-image button
 * lived on a concept card that could not exist without text.
 */
function Unconfigured({ workspaceId, imagesEnabled }: { workspaceId: string; imagesEnabled: boolean }) {
  return (
    <AppPage>
      <PageHeader title="Generate" />
      <PageEmpty
        title="AI drafting isn't configured"
        description={
          imagesEnabled
            ? "This deployment has no text model set, so concepts can't be written. Image generation is a separate model and still works — generate one from the Content library. Everything else in Create works as usual."
            : "This deployment has no model key set, so nothing can be generated. Everything else in Create works as usual — write the post yourself and publish it."
        }
        primary={
          imagesEnabled
            ? { label: "Open Content library", href: workspacePath(workspaceId, "content") }
            : { label: "Open Create", href: workspacePath(workspaceId, "create") }
        }
        secondary={{ label: "Back to Home", href: workspacePath(workspaceId, "home") }}
      />
    </AppPage>
  );
}

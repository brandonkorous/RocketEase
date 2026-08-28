import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import { workspacePath } from "@/lib/nav";

export function NoCapability({ workspaceId }: { workspaceId: string }) {
  return (
    <AppPage>
      <PageHeader title="Create" />
      <PageEmpty title="You can't create posts in this workspace" description="Your role is read-only here. Ask an owner or admin for the Creator role or higher." primary={{ label: "Back to Home", href: workspacePath(workspaceId, "home") }} />
    </AppPage>
  );
}

export function NoChannels({ workspaceId }: { workspaceId: string }) {
  return (
    <AppPage>
      <PageHeader title="Create" description="Write once, adapt per channel, preview, and schedule." />
      <PageEmpty
        title="Connect a channel to start publishing"
        description="The composer needs at least one connected social channel so it can validate and preview your post for that network."
        primary={{ label: "Connect a channel", href: workspacePath(workspaceId, "accounts") }}
        secondary={{ label: "Back to calendar", href: workspacePath(workspaceId, "calendar") }}
      />
    </AppPage>
  );
}

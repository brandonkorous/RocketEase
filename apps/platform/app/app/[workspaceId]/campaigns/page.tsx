import type { Metadata } from "next";
import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Campaigns" };

export default async function Page({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return (
    <AppPage>
      <PageHeader title="Campaigns" description="Organic content, paid promotion, audience, spend, and outcomes in one container." />
      <PageEmpty
        title="No campaigns yet"
        description="A campaign groups posts and ads around one goal so you can compare organic and paid results without rebuilding anything in another tool."
        primary={{ label: "Create a campaign", href: workspacePath(workspaceId, "campaigns") }}
        secondary={{ label: "Read how campaigns work", href: workspacePath(workspaceId, "campaigns") }}
      />
    </AppPage>
  );
}

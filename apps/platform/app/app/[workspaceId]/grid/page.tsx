import type { Metadata } from "next";
import { Suspense } from "react";
import { GridScreen } from "@/components/grid-screen";
import { GridIcon } from "@/components/shell/icons";
import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import { loadGrid, type GridQuery } from "@/lib/grid/load";
import { workspacePath } from "@/lib/nav";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Grid" };

export default async function GridPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<GridQuery> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);
  const data = await loadGrid(ctx, sp);

  if (!data) {
    return (
      <AppPage>
        <PageHeader title="Grid" description="The profile as it will look, with planned posts in place." />
        <PageEmpty
          icon={<GridIcon />}
          title="Your grid starts with a connected profile."
          description="Grid shows an Instagram, TikTok or YouTube profile as it will look, with planned posts in place. Connect a profile to see it."
          primary={{ label: "Connect a profile", href: workspacePath(workspaceId, "accounts") }}
        />
      </AppPage>
    );
  }

  return (
    <Suspense>
      <GridScreen data={data} />
    </Suspense>
  );
}

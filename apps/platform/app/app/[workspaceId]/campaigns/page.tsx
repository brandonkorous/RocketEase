import type { Metadata } from "next";
import { CampaignsScreen } from "@/components/campaigns-screen";
import { loadCampaignsList } from "@/lib/campaigns/detail";

export const metadata: Metadata = { title: "Campaigns" };

export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadCampaignsList(workspaceId, sp);
  return <CampaignsScreen data={data} />;
}

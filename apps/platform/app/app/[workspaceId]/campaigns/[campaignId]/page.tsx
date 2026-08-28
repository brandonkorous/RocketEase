import type { Metadata } from "next";
import { CampaignDetailScreen } from "@/components/campaigns/detail-screen";
import { loadCampaignDetail } from "@/lib/campaigns/detail";

export const metadata: Metadata = { title: "Campaign" };

export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string; campaignId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId, campaignId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadCampaignDetail(workspaceId, campaignId, sp);
  return <CampaignDetailScreen data={data} />;
}

import type { Metadata } from "next";
import { AnalyticsScreen } from "@/components/analytics-screen";
import { loadAnalyticsData } from "@/lib/analytics/screen";

export const metadata: Metadata = { title: "Analytics" };

export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadAnalyticsData(workspaceId, sp);
  return <AnalyticsScreen data={data} />;
}

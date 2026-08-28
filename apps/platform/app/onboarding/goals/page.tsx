import { redirect } from "next/navigation";

/** Legacy URL: goals now live in the unified onboarding flow. */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const sp = await searchParams;
  redirect(sp.workspace ? `/onboarding?step=goals&workspace=${sp.workspace}` : "/onboarding");
}

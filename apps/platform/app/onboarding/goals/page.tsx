import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Mark } from "@make-it-social/ui/icons";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { readGoals } from "@/lib/actions/settings/catalog";
import { listUserWorkspaces, requireUser } from "@/lib/session";
import { GoalsForm } from "./goals-form";

export const metadata: Metadata = { title: "Choose your goals" };

/** Onboarding step 4 (onboarding.md): goals, stored in workspace.settings. */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const mine = await listUserWorkspaces(session.user.id);
  const target = mine.find((w) => w.id === sp.workspace) ?? mine[0];
  if (!target) redirect("/onboarding");
  if (!["owner", "admin"].includes(target.role)) redirect(`/app/${target.id}/home`);
  const [row] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, target.id));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social"><Mark size={28} /><span>Make It Social</span></Link>
        <span className="text-sm text-secondary/70">Step 2 of 2 · {target.name}</span>
      </header>
      <main className="flex flex-1 justify-center px-5 pt-8 pb-16 md:pt-14">
        <div className="w-full max-w-120"><GoalsForm workspaceId={target.id} workspaceName={target.name} initial={readGoals(row?.settings ?? {})} /></div>
      </main>
    </div>
  );
}

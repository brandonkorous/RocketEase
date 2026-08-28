import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@make-it-social/ui/icons";
import { listUserWorkspaces, requireUser } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const session = await requireUser();
  const existing = await listUserWorkspaces(session.user.id);
  if (existing.length > 0) redirect(workspacePath(existing[0].id));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social">
          <Mark size={28} />
          <span>Make It Social</span>
        </Link>
        <span className="text-sm text-secondary/70">Signed in as {session.user.email}</span>
      </header>
      <main className="flex flex-1 justify-center px-5 pt-8 pb-16 md:pt-14">
        <div className="w-full max-w-120">
          <OnboardingForm userName={session.user.name || "there"} />
        </div>
      </main>
    </div>
  );
}

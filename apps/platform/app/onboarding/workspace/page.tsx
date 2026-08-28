import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Mark } from "@make-it-social/ui/icons";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { NewWorkspaceForm } from "@/components/new-workspace-form";

export const metadata: Metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  await requireUser();
  const orgs = await auth.api.listOrganizations({ headers: await headers() });
  if (!orgs?.length) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social">
          <Mark size={28} />
          <span>Make It Social</span>
        </Link>
        <Link href="/" className="text-sm font-medium underline-offset-2 hover:underline">
          Cancel
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-5 pt-8 pb-16 md:pt-14">
        <div className="w-full max-w-120">
          <NewWorkspaceForm organizations={orgs.map((o) => ({ id: o.id, name: o.name }))} />
        </div>
      </main>
    </div>
  );
}

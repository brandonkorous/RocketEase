import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSelfHosted } from "@/lib/deployment";
import { installOrganization } from "@/lib/self-hosted/install";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account" };

/** On a self-hosted install the subtitle says what sign-up means here, instead of offering a trial. */
async function selfHostedNote(): Promise<string | undefined> {
  if (!isSelfHosted()) return undefined;
  const org = await installOrganization();
  return org ? `This install belongs to ${org.name}. Sign up with the address that was invited.` : "This is a self-hosted RocketEase. The first account you create claims the install.";
}

export default async function Page() {
  if (await getSession()) redirect("/");
  const note = await selfHostedNote();
  return (
    <Suspense>
      <AuthForm mode="signup" note={note} />
    </Suspense>
  );
}

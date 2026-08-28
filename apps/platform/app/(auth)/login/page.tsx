import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page() {
  if (await getSession()) redirect("/");
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}

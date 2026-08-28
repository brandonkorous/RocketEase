import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorForm } from "@/components/two-factor-form";

export const metadata: Metadata = { title: "Two-factor code" };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  );
}

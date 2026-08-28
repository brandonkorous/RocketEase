import type { Metadata } from "next";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/reports/rate-limit";
import { confirmExternalRecipient } from "@/lib/reports/verify";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm report emails", robots: { index: false, follow: false } };

/** Double opt-in landing page. Public: the token in the link is the only proof. */
export default async function ConfirmRecipientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = !rateLimit(`confirm:${ip}`, 20, 60_000).ok;
  const result = limited ? ({ status: "invalid" } as const) : await confirmExternalRecipient(token, { ip: ip === "unknown" ? null : ip, userAgent: h.get("user-agent") });

  return (
    <main className="mx-auto w-full max-w-140 px-6 py-16">
      {result.status === "ok" ? (
        <>
          <h1 className="app-title">You&rsquo;re confirmed</h1>
          <p className="mt-2 text-base text-secondary">
            {result.email} will now receive scheduled reports for {result.workspaceName}. Every email carries a link you can ask to have revoked at any time.
          </p>
        </>
      ) : (
        <>
          <h1 className="app-title">{result.status === "expired" ? "This confirmation expired" : "This link isn't valid"}</h1>
          <p className="mt-2 text-base text-secondary">
            {result.status === "expired"
              ? "Confirmation links last seven days. Ask whoever invited you to send a new one."
              : "It may already have been used, or the address was removed. Nothing has been sent to you."}
          </p>
        </>
      )}
    </main>
  );
}

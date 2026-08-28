import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveShare, type ShareAccess } from "@/lib/reports/access";
import { rateLimit } from "@/lib/reports/rate-limit";
import { passcodeCookieName, passcodeProof } from "@/lib/reports/share";
import { PasscodeForm } from "./passcode-form";
import { ReportView } from "./report-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report", robots: { index: false, follow: false } };

const Shell = ({ children }: { children: React.ReactNode }) => <main className="mx-auto w-full max-w-260 px-6 py-12">{children}</main>;

async function passcodeSatisfied(share: Extract<ShareAccess, { status: "ok" }>) {
  if (!share.needsPasscode || !share.passcodeHash) return true;
  const jar = await cookies();
  return jar.get(passcodeCookieName(share.shareId))?.value === passcodeProof(share.shareId, share.passcodeHash);
}

/** Public, session-free report view. Nothing here reveals a workspace or organization id. */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`share:${ip}`, 60, 60_000).ok) {
    return (
      <Shell>
        <h1 className="app-title">Too many requests</h1>
        <p className="mt-2 max-w-140 text-base text-secondary">Give it a minute and reload this page.</p>
      </Shell>
    );
  }

  // Unknown, expired and revoked are one 404: a dead link never confirms it once existed.
  const share = await resolveShare(token);
  if (share.status !== "ok") notFound();
  if (await passcodeSatisfied(share)) {
    return (
      <Shell>
        <ReportView token={token} share={share} />
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="text-sm font-semibold">{share.brand.name}</p>
      <h1 className="app-title mt-2">{share.runName}</h1>
      <p className="mt-2 max-w-140 text-base text-secondary">This report is protected by a passcode. Enter the one you were given to open it.</p>
      <PasscodeForm token={token} />
    </Shell>
  );
}

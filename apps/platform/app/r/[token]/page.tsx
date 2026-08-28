import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { resolveShare, type ShareAccess } from "@/lib/reports/access";
import { rateLimit } from "@/lib/reports/rate-limit";
import { passcodeCookieName, passcodeProof } from "@/lib/reports/share";
import { PasscodeForm } from "./passcode-form";
import { ReportView } from "./report-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report", robots: { index: false, follow: false } };

const MESSAGES = {
  not_found: { title: "This link isn't available", body: "The address may be mistyped, or the report it pointed to was removed. Ask whoever sent it for a fresh link." },
  expired: { title: "This link has expired", body: "Report links are time-limited. Ask whoever sent it to share a new one." },
  revoked: { title: "This link was revoked", body: "Access to this report was withdrawn. Ask whoever sent it for a new link." },
  rate_limited: { title: "Too many requests", body: "Give it a minute and reload this page." },
} as const;

const Shell = ({ children }: { children: React.ReactNode }) => <main className="mx-auto w-full max-w-260 px-6 py-12">{children}</main>;

function Notice({ kind }: { kind: keyof typeof MESSAGES }) {
  return (
    <Shell>
      <h1 className="app-title">{MESSAGES[kind].title}</h1>
      <p className="mt-2 max-w-140 text-base text-secondary">{MESSAGES[kind].body}</p>
    </Shell>
  );
}

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
  if (!rateLimit(`share:${ip}`, 60, 60_000).ok) return <Notice kind="rate_limited" />;

  const share = await resolveShare(token);
  if (share.status !== "ok") return <Notice kind={share.status} />;
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

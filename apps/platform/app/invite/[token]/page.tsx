import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";
import { db } from "@/db";
import { getSession } from "@/lib/session";
import { AcceptInviteButton } from "@/components/accept-invite-button";

export const metadata: Metadata = { title: "Invitation" };

/** Public route (middleware allows /invite). Shows the object-level context only, never the org's other data. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSession();
  const inv = await db.query.workspaceInvitation.findFirst({
    where: (i, { eq }) => eq(i.token, token),
    with: {},
  });
  const ws = inv ? await db.query.workspace.findFirst({ where: (w, { eq }) => eq(w.id, inv.workspaceId) }) : null;
  const org = inv ? await db.query.organization.findFirst({ where: (o, { eq }) => eq(o.id, inv.organizationId) }) : null;
  const valid = inv && ws && org && inv.status === "pending" && inv.expiresAt > new Date();
  const next = `/invite/${token}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-container flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="RocketEase">
          <Mark size={28} />
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-5 pt-10 pb-16 md:pt-16">
        <div className="w-full max-w-110">
          {!valid ? (
            <>
              <h1 className="app-title">This invitation isn&apos;t valid</h1>
              <p className="mt-2 text-base text-secondary">
                It may have expired, been revoked, or already been used. Ask the person who invited you to send a new one.
              </p>
            </>
          ) : (
            <>
              <h1 className="app-title">Join {ws.name}</h1>
              <p className="mt-2 text-base leading-relaxed text-secondary">
                You&apos;ve been invited to the <strong>{ws.name}</strong> workspace in <strong>{org.name}</strong> as{" "}
                <strong className="capitalize">{inv.role.replace("_", " ")}</strong>.
              </p>
              <p className="mt-2 text-sm text-secondary/70">Sent to {inv.email}.</p>
              {session ? (
                <div className="mt-6">
                  {session.user.email.toLowerCase() === inv.email ? (
                    <AcceptInviteButton token={token} />
                  ) : (
                    <p className="text-sm text-error">
                      You&apos;re signed in as {session.user.email}. Sign out and use {inv.email} to accept.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link href={`/signup?next=${encodeURIComponent(next)}`} className={buttonClasses({ color: "primary" })}>
                    Create account
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClasses({ color: "neutral", variant: "outline" })}>
                    I already have an account
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

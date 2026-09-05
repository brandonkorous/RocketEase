import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Table } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";
import { listUserWorkspaces, requireUser } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { conversationSummary } from "@/lib/engagement/summary";
import { overdueRequestsFor } from "@/lib/approvals/due";
import { orgSecurity } from "@/lib/sso/queries";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { and, count, eq, ne } from "drizzle-orm";
import { BrandingSection } from "@/components/agency/branding-section";
import { EconomicsSection } from "@/components/agency/margin-section";

export const metadata: Metadata = { title: "Agency overview" };

/** Read-only client list (pages.md): no mutation without entering a workspace. */
export default async function AgencyPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const session = await requireUser();
  const workspaces = await listUserWorkspaces(session.user.id);
  if (workspaces.length === 0) redirect("/onboarding");

  const attention = new Map(await Promise.all(workspaces.map(async (w) => {
    const me = { userId: session.user.id, role: w.role, grants: w.grants };
    const [convs, [{ n: channels }], overdue] = await Promise.all([conversationSummary(w.id, session.user.id, w.timezone, 0), db.select({ n: count() }).from(channel).where(and(eq(channel.workspaceId, w.id), ne(channel.status, "disconnected"))), overdueRequestsFor(w.id, me)]);
    return [w.id, { convs, channels: Number(channels), overdue: overdue.length }] as const;
  })));
  const security = await orgSecurity(workspaces.map((w) => w.organizationId));
  const byOrg = new Map<string, typeof workspaces>();
  for (const w of workspaces) byOrg.set(w.organizationId, [...(byOrg.get(w.organizationId) ?? []), w]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-base-300">
        <div className="page-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="RocketEase">
            <Mark size={28} />
            <Wordmark />
          </Link>
          <Link href="/onboarding/workspace" className={buttonClasses({ color: "primary", size: "sm" })}>
            New workspace
          </Link>
        </div>
      </header>
      <main className="page-container py-10">
        <h1 className="app-title">Agency overview</h1>
        <p className="mt-1 text-base text-secondary">
          Every client workspace you can access, with what needs attention in each.
        </p>

        {[...byOrg.entries()].map(([orgId, list]) => (
          <section key={orgId} className="mt-10" aria-labelledby={`org-${orgId}`}>
            <h2 id={`org-${orgId}`} className="text-sm font-semibold text-secondary/70">
              {list[0].organizationName}
            </h2>
            <p className="mt-1 text-xs text-secondary/70">
              Organization security: {security.get(orgId)?.connections ? (security.get(orgId)!.ssoEnforced ? "SSO required" : "SSO available") : "No SSO"} ·{" "}
              {security.get(orgId)?.scimActive ? "SCIM provisioning active" : "SCIM off"}
            </p>
            <Table className="mt-3 w-full">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Your role</th>
                  <th>Timezone</th>
                  <th>Connections</th>
                  <th>Conversations</th>
                  <th>Approvals</th>
                  <th className="text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {list.map((w) => (
                  <tr key={w.id}>
                    <td className="font-medium">
                      {w.name} {w.pinned && <Badge size="xs" variant="soft" color="neutral">Pinned</Badge>}
                    </td>
                    <td className="capitalize">{w.role.replace("_", " ")}</td>
                    <td>{w.timezone}</td>
                    <td className={attention.get(w.id)?.channels ? "" : "text-secondary/70"}>{attention.get(w.id)?.channels ? `${attention.get(w.id)!.channels} connected` : "No channels yet"}</td>
                    <td>{attention.get(w.id)?.convs.unresolved ? <Link href={workspacePath(w.id, "inbox")} className="hover:underline">{attention.get(w.id)!.convs.unresolved} unresolved{attention.get(w.id)!.convs.assignedToMe ? ` · ${attention.get(w.id)!.convs.assignedToMe} yours` : ""}</Link> : <span className="text-secondary/70">—</span>}</td>
                    <td>{attention.get(w.id)?.overdue ? <Link href={workspacePath(w.id, "approvals?tab=overdue")} className="hover:underline">{attention.get(w.id)!.overdue} overdue</Link> : <span className="text-secondary/70">—</span>}</td>
                    <td className="text-right">
                      <Link href={workspacePath(w.id)} className={buttonClasses({ color: "neutral", variant: "outline", size: "sm" })}>
                        Enter
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <BrandingSection organizationId={orgId} userId={session.user.id} clients={list.map((w) => ({ id: w.id, name: w.name }))} />
            <EconomicsSection organizationId={orgId} userId={session.user.id} clients={list.map((w) => ({ id: w.id, name: w.name }))} timezone={list[0].timezone} period={period} />
          </section>
        ))}
      </main>
    </div>
  );
}

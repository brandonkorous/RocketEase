import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppPage, PageHeader } from "@/components/page-frame";
import { SecurityPanel, type SessionRow } from "@/components/security-panel";
import { ApprovalPolicies, type PolicyView } from "@/components/approval-policies";
import { db } from "@/db";
import { approvalPolicy } from "@/db/schema/approvals";
import { channel } from "@/db/schema/connections";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { SETTINGS_SECTIONS, workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ workspaceId: string; section: string }> }) {
  const { workspaceId, section } = await params;
  const current = SETTINGS_SECTIONS.find((s) => s.slug === section);
  if (!current) notFound();
  const { workspace, session } = await requireWorkspace(workspaceId);

  let policies: PolicyView[] = [];
  let channels: { id: string; name: string; network: string }[] = [];
  if (section === "team") {
    const rows = await db.select().from(approvalPolicy).where(eq(approvalPolicy.workspaceId, workspaceId)).orderBy(approvalPolicy.createdAt);
    policies = rows.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled, channelIds: p.rule.channelIds ?? [], authorRoles: p.rule.authorRoles ?? [], approverRoles: p.approverRoles, separationOfDuty: p.separationOfDuty, dueHours: p.dueHours }));
    channels = await db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"])));
  }
  let sessions: SessionRow[] = [];
  if (section === "security") {
    const list = await auth.api.listSessions({ headers: await headers() });
    sessions = list
      .map((s) => ({
        token: s.token,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        current: s.token === session.session.token,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt));
  }

  return (
    <AppPage>
      <PageHeader title="Settings" description={workspace.name} />
      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          {SETTINGS_SECTIONS.map((s) => (
            <Link
              key={s.slug}
              href={workspacePath(workspaceId, `settings/${s.slug}`)}
              aria-current={s.slug === section ? "page" : undefined}
              className={`whitespace-nowrap rounded-field px-3 py-2 text-sm ${
                s.slug === section ? "bg-base-200 font-semibold" : "text-secondary hover:bg-base-200"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <section aria-labelledby="section-title" className="min-w-0">
          <h2 id="section-title" className="text-xl font-bold tracking-tight">
            {current.label}
          </h2>
          {section === "general" && (
            <dl className="mt-4 grid max-w-140 grid-cols-[140px_1fr] gap-y-3 text-sm">
              <dt className="text-secondary/70">Workspace</dt>
              <dd className="font-medium">{workspace.name}</dd>
              <dt className="text-secondary/70">Slug</dt>
              <dd className="font-mono text-sm">{workspace.slug}</dd>
              <dt className="text-secondary/70">Timezone</dt>
              <dd>{workspace.timezone}</dd>
              <dt className="text-secondary/70">Organization</dt>
              <dd>{workspace.organizationName}</dd>
              <dt className="text-secondary/70">Your role</dt>
              <dd className="capitalize">{workspace.role.replace("_", " ")}</dd>
            </dl>
          )}
          {section === "security" && (
            <>
              <p className="mt-1 text-sm text-secondary">
                These settings are for your account ({session.user.email}) and apply across every workspace.
              </p>
              <SecurityPanel twoFactorEnabled={Boolean(session.user.twoFactorEnabled)} sessions={sessions} />
            </>
          )}
          {section === "team" && (
            <>
              <p className="mt-1 text-sm text-secondary">Members and roles are managed on the <Link href={workspacePath(workspaceId, "team")} className="font-medium underline underline-offset-2">Team</Link> page.</p>
              <ApprovalPolicies workspaceId={workspaceId} policies={policies} channels={channels} canEdit={hasCapability(workspace, "workspace.settings")} />
            </>
          )}
          {section !== "general" && section !== "security" && section !== "team" && (
            <p className="mt-3 max-w-140 text-sm leading-relaxed text-secondary">
              {current.label} settings arrive with the feature they govern. Changes here will show explicit save and impact feedback, and every
              change is recorded in the audit log.
            </p>
          )}
        </section>
      </div>
    </AppPage>
  );
}

import Link from "next/link";
import { ApprovalPolicies } from "@/components/approval-policies";
import { SecurityPanel } from "@/components/security-panel";
import { AutomationsSettings } from "@/components/settings/automations";
import { BrandVoiceSettings } from "@/components/settings/brand-voice-settings";
import { InboxSettings } from "@/components/settings/inbox-settings";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { SsoSettings } from "@/components/settings/sso-settings";
import { TrackingSettings } from "@/components/settings/tracking-settings";
import { GOALS } from "@/lib/actions/settings/catalog";
import { hasCapability, type WorkspaceContext } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import type { SectionData } from "./load";

type Props = { section: string; label: string; ctx: WorkspaceContext; data: SectionData };

export function SectionBody({ section, label, ctx, data }: Props) {
  const { workspace, session } = ctx;
  const canEdit = hasCapability(workspace, "workspace.settings");
  switch (section) {
    case "general":
      return <General ctx={ctx} goals={data.goals} canEdit={canEdit} />;
    case "security":
      return (
        <>
          <p className="mt-1 text-sm text-secondary">These settings are for your account ({session.user.email}) and apply across every workspace.</p>
          <SecurityPanel twoFactorEnabled={Boolean(session.user.twoFactorEnabled)} sessions={data.sessions} />
        </>
      );
    case "team":
      return (
        <>
          <p className="mt-1 text-sm text-secondary">Members and roles are managed on the <Link href={workspacePath(workspace.id, "team")} className="font-medium underline underline-offset-2">Team</Link> page.</p>
          <ApprovalPolicies workspaceId={workspace.id} policies={data.policies} channels={data.channels} canEdit={canEdit} />
        </>
      );
    case "brand":
      return <BrandVoiceSettings workspaceId={workspace.id} initial={data.brandVoice} canEdit={canEdit} aiEnabled={data.aiEnabled} />;
    case "inbox":
      return <InboxSettings workspaceId={workspace.id} minutes={data.inbox.minutes} replies={data.inbox.replies} canEdit={canEdit} canHandle={hasCapability(workspace, "conversations.handle")} />;
    case "automations":
      return <AutomationsSettings workspaceId={workspace.id} data={data.automations} canEdit={canEdit} />;
    case "tracking":
      return <TrackingSettings workspaceId={workspace.id} initial={data.tracking} canEdit={canEdit} sources={data.sources} enabled={data.sourceKinds} />;
    case "sso":
      return <SsoSettings workspaceId={workspace.id} data={data.sso} />;
    case "notifications":
      return <NotificationSettings workspaceId={workspace.id} prefs={data.prefs} email={session.user.email} />;
    default:
      return (
        <p className="mt-3 max-w-140 text-sm leading-relaxed text-secondary">
          {label} settings arrive with the feature they govern. Changes here will show explicit save and impact feedback, and every change is recorded in the audit log.
        </p>
      );
  }
}

function General({ ctx, goals, canEdit }: { ctx: WorkspaceContext; goals: string[]; canEdit: boolean }) {
  const { workspace } = ctx;
  const goalLabels = GOALS.filter((g) => goals.includes(g.key)).map((g) => g.label);
  return (
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
      <dt className="text-secondary/70">Goals</dt>
      <dd>
        {goalLabels.length ? goalLabels.join(", ") : <span className="text-secondary/70">Not set</span>}
        {canEdit && <Link href={`/onboarding/goals?workspace=${workspace.id}`} className="ml-2 text-xs font-medium underline underline-offset-2">Change</Link>}
      </dd>
    </dl>
  );
}

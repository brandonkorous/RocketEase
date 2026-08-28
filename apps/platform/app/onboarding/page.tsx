import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workspace, workspaceInvitation } from "@/db/schema/app";
import { channel } from "@/db/schema/connections";
import { ConnectStep } from "@/components/onboarding/connect-step";
import { DoneStep } from "@/components/onboarding/done-step";
import { FirstPostStep } from "@/components/onboarding/first-post-step";
import { OnboardingFrame, type OnboardingStep } from "@/components/onboarding/frame";
import { InviteStep } from "@/components/onboarding/invite-step";
import { WorkspaceStep } from "@/components/onboarding/workspace-step";
import { GoalsForm } from "./goals/goals-form";
import { readGoals } from "@/lib/actions/settings/catalog";
import { workspacePath } from "@/lib/nav";
import { providers } from "@/lib/providers";
import { listUserWorkspaces, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Get started" };
const STEPS: OnboardingStep[] = ["workspace", "connect", "invite", "goals", "first-post", "done"];
const href = (step: OnboardingStep, ws: string) => `/onboarding?step=${step}&workspace=${ws}`;

/** Five-step onboarding (onboarding mockup). Step 1 creates the workspace; later steps are keyed by ?workspace. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; workspace?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const mine = await listUserWorkspaces(session.user.id);
  const target = mine.find((w) => w.id === sp.workspace);
  const step = (STEPS.includes(sp.step as OnboardingStep) ? sp.step : "workspace") as OnboardingStep;

  if (step === "workspace") {
    if (mine.length > 0) redirect(href("connect", mine[0].id));
    return <OnboardingFrame step="workspace" exitHref={null}><WorkspaceStep /></OnboardingFrame>;
  }
  if (!target) redirect(mine.length ? href("connect", mine[0].id) : "/onboarding");
  if (!["owner", "admin"].includes(target.role)) redirect(workspacePath(target.id, "home"));
  const dashboard = workspacePath(target.id, "home");
  const body = await stepBody(step, target.id, target.name, session.user.name);
  return <OnboardingFrame step={step} exitHref={dashboard}>{body}</OnboardingFrame>;
}

async function stepBody(step: OnboardingStep, ws: string, wsName: string, userName: string) {
  const channels = () => db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, ws), inArray(channel.status, ["healthy", "degraded", "syncing", "connecting"])));
  switch (step) {
    case "connect": {
      const opts = [...providers().values()].map((p) => ({ key: p.key, displayName: p.displayName, networks: p.networks as string[] }));
      return <ConnectStep workspaceId={ws} providers={opts} channels={await channels()} nextHref={href("invite", ws)} />;
    }
    case "invite": {
      const rows = await db.select({ id: workspaceInvitation.id, email: workspaceInvitation.email, role: workspaceInvitation.role }).from(workspaceInvitation).where(and(eq(workspaceInvitation.workspaceId, ws), eq(workspaceInvitation.status, "pending")));
      return <InviteStep workspaceId={ws} invitees={rows} nextHref={href("goals", ws)} />;
    }
    case "goals": {
      const [row] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, ws));
      return <GoalsForm workspaceId={ws} workspaceName={wsName} initial={readGoals(row?.settings ?? {})} nextHref={href("first-post", ws)} />;
    }
    case "first-post":
      return <FirstPostStep workspaceId={ws} channels={await channels()} doneHref={href("done", ws)} />;
    default:
      return <DoneStep firstName={userName.split(" ")[0] || "there"} dashboardHref={workspacePath(ws, "home")} />;
  }
}

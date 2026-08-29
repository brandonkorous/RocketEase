import Link from "next/link";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { CheckIcon } from "@rocketease/ui/icons";
import { NetMark } from "@/components/library-screen";
import { db } from "@/db";
import { workspace, workspaceInvitation, workspaceMembership } from "@/db/schema/app";
import { contentItem } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { readGoals } from "@/lib/actions/settings/catalog";
import { readBrandKit } from "@/lib/brand/read";
import { workspacePath } from "@/lib/nav";

export type ChecklistStep = { n: number; title: string; desc: string; done: boolean; cta: string; href: string };

/** ONB-001: every step derives from real workspace state, never from a stored flag. */
export async function loadChecklist(workspaceId: string): Promise<{ steps: ChecklistStep[]; allDone: boolean }> {
  const n = (q: Promise<{ n: number }[]>) => q.then(([r]) => Number(r?.n ?? 0));
  const [ws, channels, members, invites, items, published] = await Promise.all([
    db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId)).then(([r]) => r),
    n(db.select({ n: count() }).from(channel).where(and(eq(channel.workspaceId, workspaceId), ne(channel.status, "disconnected")))),
    n(db.select({ n: count() }).from(workspaceMembership).where(eq(workspaceMembership.workspaceId, workspaceId))),
    n(db.select({ n: count() }).from(workspaceInvitation).where(and(eq(workspaceInvitation.workspaceId, workspaceId), eq(workspaceInvitation.status, "pending")))),
    n(db.select({ n: count() }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt)))),
    n(db.select({ n: count() }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), eq(contentItem.status, "published")))),
  ]);
  const goals = readGoals(ws?.settings ?? {});
  const kit = readBrandKit(ws?.settings ?? {});
  const brandStarted = Boolean(kit.identity.oneLiner || kit.voice.tone || kit.visual.palette.length || kit.visual.logos.length);
  const p = (s: string) => workspacePath(workspaceId, s);
  const steps: ChecklistStep[] = [
    { n: 1, title: "Set your goals", desc: "Tell us what this workspace is for so Home can suggest the next step.", done: goals.length > 0, cta: "Choose goals", href: `/onboarding/goals?workspace=${workspaceId}` },
    { n: 2, title: "Connect social accounts", desc: "Add your social profiles to start publishing.", done: channels > 0, cta: "Connect accounts", href: p("accounts") },
    { n: 3, title: "Set up your brand", desc: "How the brand sounds and looks. Everything drafted or generated here reads from it.", done: brandStarted, cta: "Open Brand", href: p("brand") },
    { n: 4, title: "Create your first post", desc: "Write once, adapt per channel, and schedule it.", done: items > 0, cta: "Create post", href: p("create") },
    { n: 5, title: "Invite your team", desc: "Collaborate with teammates and assign roles.", done: members > 1 || invites > 0, cta: "Invite teammates", href: p("team") },
    { n: 6, title: "Publish your first post", desc: "See it live, then review results in Analytics.", done: published > 0, cta: "Open calendar", href: p("calendar") },
  ];
  return { steps, allDone: steps.every((s) => s.done) };
}

const ICONS = ["◎", "", "◆", "✎", "👥", "✈"];

export function Checklist({ steps }: { steps: ChecklistStep[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="mt-5 rounded-box border border-base-300 p-5" aria-labelledby="steps-h">
      <div className="flex items-center justify-between"><h2 id="steps-h" className="text-base font-semibold">Get started in 5 simple steps</h2><span className="text-xs text-secondary/70">{done} of {steps.length} done</span></div>
      <p className="text-sm text-secondary">Follow these steps to get the most out of RocketEase.</p>
      <ol className="mt-5 grid gap-6 md:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.n} className="relative flex flex-col items-center text-center">
            <span className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${s.done ? "border-base-content bg-base-content text-base-100" : "border-base-300"}`}>{s.done ? <CheckIcon size={12} /> : s.n}</span>
            <div className={`mt-2 flex h-16 w-24 items-center justify-center rounded-lg border border-base-300 ${s.done ? "bg-base-200" : ""}`}>
              {i === 1 ? <span className="flex gap-1"><NetMark network="instagram" /><NetMark network="facebook" /><NetMark network="linkedin" /></span> : <span className="text-2xl text-secondary/50">{ICONS[i]}</span>}
            </div>
            <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
            <p className="mt-1 text-xs text-secondary">{s.desc}</p>
            <Link href={s.href} className={`${buttonClasses({ variant: "outline", color: "neutral", size: "sm" })} mt-3`}>{s.done ? "Review" : s.cta}</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

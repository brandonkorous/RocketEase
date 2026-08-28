"use client";

import { Button, Checkbox } from "@wizeworks/silicaui-react";
import { GOALS, GOAL_KEYS, type GoalKey } from "@/lib/actions/settings/catalog";
import { setWorkspaceGoals } from "@/lib/actions/settings/goals";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { StepIntro } from "@/components/onboarding/frame";

const TargetIcon = () => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>;

/** Step 4: goals stored in workspace.settings. Uncontrolled inputs so a click before hydration still counts. */
export function GoalsForm({ workspaceId, workspaceName, initial, nextHref }: { workspaceId: string; workspaceName: string; initial: GoalKey[]; nextHref?: string }) {
  const { run, pending, router, toast } = useActionFeedback();
  const done = nextHref ?? workspacePath(workspaceId, "home");
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const goals = new FormData(e.currentTarget).getAll("goals").map(String).filter((g): g is GoalKey => (GOAL_KEYS as readonly string[]).includes(g));
    if (goals.length === 0) return toast.add({ title: "Pick at least one goal, or skip for now.", type: "error" });
    run(() => setWorkspaceGoals({ workspaceId, goals }), (r) => { if (!r.error) router.push(done); });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <StepIntro icon={<TargetIcon />} title="What are your top goals?" copy={`We'll customize ${workspaceName}'s experience based on what matters most.`} />
      <ul className="flex flex-col gap-2">
        {GOALS.map((g) => (
          <li key={g.key}>
            <label className="flex cursor-pointer items-center gap-3 rounded-field border border-base-300 px-3 py-2.5">
              <span className="flex-1"><span className="block text-sm font-semibold">{g.label}</span><span className="block text-xs text-secondary">{g.desc}</span></span>
              <Checkbox name="goals" value={g.key} defaultChecked={initial.includes(g.key)} aria-label={g.label} />
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-2">
        <Button type="submit" color="primary" size="lg" block loading={pending}>Continue</Button>
        <button type="button" className="text-sm text-secondary hover:underline" onClick={() => router.push(done)}>Skip for now</button>
      </div>
    </form>
  );
}

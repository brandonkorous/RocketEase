"use client";

import { useState } from "react";
import { Button, Checkbox } from "@wizeworks/silicaui-react";
import { GOALS, type GoalKey } from "@/lib/actions/settings/catalog";
import { setWorkspaceGoals } from "@/lib/actions/settings/goals";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";

export function GoalsForm({ workspaceId, workspaceName, initial }: { workspaceId: string; workspaceName: string; initial: GoalKey[] }) {
  const { run, pending, router } = useActionFeedback();
  const [goals, setGoals] = useState<GoalKey[]>(initial);
  const toggle = (k: GoalKey, on: boolean) => setGoals((g) => (on ? [...new Set([...g, k])] : g.filter((x) => x !== k)));
  const submit = (e: React.FormEvent) => { e.preventDefault(); run(() => setWorkspaceGoals({ workspaceId, goals }), (r) => { if (!r.error) router.push(workspacePath(workspaceId, "home")); }); };
  return (
    <form onSubmit={submit} className="flex flex-col gap-7">
      <div>
        <h1 className="app-title">What do you want to do with {workspaceName}?</h1>
        <p className="mt-2 text-base leading-relaxed text-secondary">Pick everything that applies. Home uses this to suggest the next best action; you can change it any time in Settings.</p>
      </div>
      <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300">
        {GOALS.map((g) => (
          <li key={g.key}>
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
              <Checkbox className="mt-0.5" checked={goals.includes(g.key)} onChange={(e) => toggle(g.key, e.target.checked)} />
              <span><span className="block text-sm font-semibold">{g.label}</span><span className="block text-sm text-secondary">{g.desc}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" size="lg" loading={pending} disabled={goals.length === 0}>Continue</Button>
        <Button type="button" variant="ghost" color="neutral" onClick={() => router.push(workspacePath(workspaceId, "home"))}>Skip for now</Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Button, Input, Label } from "@wizeworks/silicaui-react";
import { duplicateItem } from "@/lib/actions/content";
import { saveAsTemplate } from "@/lib/actions/templates";
import type { RecommendationRow } from "@/lib/recommendations/store";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { RecommendationCard } from "@/components/recommendations/card";

type Props = { workspaceId: string; itemId: string; title: string; canCreate: boolean; recs: RecommendationRow[] };

/** Reuse (content-model.md "Templates and reuse"): duplicate as a traceable child, or snapshot as a template. */
export function Reuse({ workspaceId, itemId, title, canCreate, recs }: Props) {
  const { run, pending, router } = useActionFeedback();
  const [name, setName] = useState(title);

  const onDuplicate = () =>
    run(async () => {
      const r = await duplicateItem(workspaceId, itemId);
      if ("itemId" in r) { router.push(workspacePath(workspaceId, `create?item=${r.itemId}`)); return { ok: "Duplicated." }; }
      return r;
    });

  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="reuse-h">
      <h2 id="reuse-h" className="text-base font-semibold">Reuse</h2>
      <p className="mt-1 text-sm text-secondary">Run this post again as a new draft, or save its shape as a template. Both keep a link back to this post in the activity log.</p>
      {recs.length > 0 && <div className="mt-3 flex flex-col gap-3">{recs.map((r) => (<RecommendationCard key={r.id} workspaceId={workspaceId} rec={r} compact />))}</div>}
      {canCreate ? (
        <>
          <Button className="mt-3" variant="outline" color="neutral" size="sm" disabled={pending} onClick={onDuplicate}>Duplicate as a new draft</Button>
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); run(() => saveAsTemplate({ workspaceId, itemId, name })); }}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="reuse-tpl">Save as a template</Label>
              <Input id="reuse-tpl" size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" maxLength={80} />
            </div>
            <Button type="submit" size="sm" color="primary" loading={pending} disabled={!name.trim()}>Save</Button>
          </form>
        </>
      ) : (
        <p className="mt-3 text-sm text-secondary/70">You need permission to create content before you can reuse this post.</p>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, Input, Label } from "@wizeworks/silicaui-react";
import { createFromTemplate, deleteTemplate, saveAsTemplate, type TemplateRow } from "@/lib/actions/templates";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";

type Props = { workspaceId: string; itemId: string; templates: TemplateRow[]; canEdit: boolean; trigger: React.ReactElement };

/** "Save as template" + "Start from template" (content-model.md "Templates and reuse"). */
export function TemplateDialog({ workspaceId, itemId, templates, canEdit, trigger }: Props) {
  const { run, pending, router } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const save = (e: React.FormEvent) => { e.preventDefault(); run(() => saveAsTemplate({ workspaceId, itemId, name }), (r) => { if (!r.error) setName(""); }); };
  const start = (id: string) => run(async () => { const r = await createFromTemplate(workspaceId, id); if ("itemId" in r) { setOpen(false); router.push(workspacePath(workspaceId, `create?item=${r.itemId}`)); return { ok: "Draft created from template." }; } return r; });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-130">
        <DialogTitle>Templates</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">Save this post as a reusable starting point, or start a new draft from one. Every draft created this way keeps a link to its template in the activity log.</DialogDescription>
        <form onSubmit={save} className="mt-4 flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5"><Label htmlFor="tpl-name">Save this post as a template</Label><Input id="tpl-name" size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly tip" maxLength={80} /></div>
          <Button type="submit" size="sm" color="primary" loading={pending} disabled={!name.trim()}>Save</Button>
        </form>
        <h3 className="mt-5 text-sm font-semibold">Start from a template</h3>
        <TemplateList templates={templates} canEdit={canEdit} pending={pending} onStart={start} onDelete={(id) => run(() => deleteTemplate(workspaceId, id))} />
        <div className="mt-5 flex justify-end"><DialogClose><Button variant="ghost" color="neutral">Close</Button></DialogClose></div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateList({ templates, canEdit, pending, onStart, onDelete }: { templates: TemplateRow[]; canEdit: boolean; pending: boolean; onStart: (id: string) => void; onDelete: (id: string) => void }) {
  if (templates.length === 0) return <p className="mt-2 text-sm text-secondary/70">No templates yet. Save one above to reuse it later.</p>;
  return (
    <ul className="mt-2 max-h-72 divide-y divide-base-300 overflow-y-auto rounded-box border border-base-300">
      {templates.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.name}</span><span className="block truncate text-xs text-secondary/70">{t.text || "No text"} · {t.channelCount} channel{t.channelCount === 1 ? "" : "s"} · used {t.usageCount}×</span></span>
          <Button size="xs" variant="outline" color="neutral" disabled={pending} onClick={() => onStart(t.id)}>Use</Button>
          {canEdit && <Button size="xs" variant="ghost" color="error" disabled={pending} onClick={() => onDelete(t.id)} aria-label={`Delete template ${t.name}`}>×</Button>}
        </li>
      ))}
    </ul>
  );
}

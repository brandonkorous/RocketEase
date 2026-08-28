"use client";

import { useState } from "react";
import { Button, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { deleteSavedReply, saveSavedReply } from "@/lib/actions/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";

export type SavedReplyRow = { id: string; title: string; body: string; shortcut: string | null; updatedAt: string };
type Draft = { id?: string; title: string; body: string; shortcut: string };
const blank = (): Draft => ({ title: "", body: "", shortcut: "" });

export function SavedReplies({ workspaceId, replies, canHandle }: { workspaceId: string; replies: SavedReplyRow[]; canHandle: boolean }) {
  const { run, pending } = useActionFeedback();
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = (e: React.FormEvent) => { e.preventDefault(); if (!draft) return; run(() => saveSavedReply(workspaceId, { id: draft.id, title: draft.title, body: draft.body, shortcut: draft.shortcut || undefined }), (r) => { if (!r.error) setDraft(null); }); };
  return (
    <section aria-labelledby="sr-h">
      <div className="flex items-center justify-between"><h3 id="sr-h" className="text-base font-semibold">Saved replies</h3>{canHandle && !draft && <Button size="sm" color="primary" onClick={() => setDraft(blank())}>New saved reply</Button>}</div>
      <p className="mt-1 text-sm leading-relaxed text-secondary">Reusable answers the whole team can insert from the inbox reply box. Anyone who handles conversations can add or edit them.</p>
      {draft && <ReplyForm draft={draft} pending={pending} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} />}
      <table className="mt-4 w-full text-sm">
        <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Title</th><th className="pb-2 text-left font-medium">Text</th><th className="pb-2 text-left font-medium">Shortcut</th><th className="pb-2 text-left font-medium">Updated</th><th /></tr></thead>
        <tbody className="divide-y divide-base-300">
          {replies.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 font-medium">{r.title}</td>
              <td className="max-w-80 truncate py-2 pr-3 text-secondary">{r.body}</td>
              <td className="py-2 pr-3 font-mono text-xs">{r.shortcut ?? "—"}</td>
              <td className="py-2 pr-3 text-xs text-secondary/70">{r.updatedAt}</td>
              <td className="py-2 text-right">{canHandle && (<span className="flex justify-end gap-1"><Button size="xs" variant="outline" color="neutral" onClick={() => setDraft({ id: r.id, title: r.title, body: r.body, shortcut: r.shortcut ?? "" })}>Edit</Button><ConfirmDialog trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Delete</Button>} title={`Delete "${r.title}"?`} description="It disappears from the inbox reply picker for everyone." confirmLabel="Delete" onConfirm={() => run(() => deleteSavedReply(workspaceId, r.id))} /></span>)}</td>
            </tr>
          ))}
          {replies.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-xs text-secondary/70">No saved replies yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function ReplyForm({ draft, pending, onChange, onSave, onCancel }: { draft: Draft; pending: boolean; onChange: (d: Draft) => void; onSave: (e: React.FormEvent) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSave} className="mt-3 flex flex-col gap-3 rounded-box border border-base-300 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div className="flex flex-col gap-1.5"><Label htmlFor="sr-title">Title</Label><Input id="sr-title" size="sm" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} maxLength={80} required /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="sr-shortcut">Shortcut <span className="font-normal text-secondary/70">(optional)</span></Label><Input id="sr-shortcut" size="sm" value={draft.shortcut} onChange={(e) => onChange({ ...draft, shortcut: e.target.value })} maxLength={30} placeholder="/thanks" /></div>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="sr-body">Reply text</Label><Textarea id="sr-body" rows={4} value={draft.body} onChange={(e) => onChange({ ...draft, body: e.target.value })} maxLength={2000} required className="w-full text-sm" /></div>
      <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" color="primary" loading={pending} disabled={!draft.title.trim() || !draft.body.trim()}>{draft.id ? "Save changes" : "Add reply"}</Button></div>
    </form>
  );
}

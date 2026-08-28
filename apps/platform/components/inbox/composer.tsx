"use client";

import { useState } from "react";
import { Button, Textarea } from "@wizeworks/silicaui-react";
import type { ConversationDetailData } from "@/lib/engagement/detail";
import { addInternalNote, saveSavedReply, sendReply } from "@/lib/actions/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Mode = "reply" | "note";

function SavedReplies({ d, onPick, onSave, text }: { d: ConversationDetailData; onPick: (body: string) => void; onSave: () => void; text: string }) {
  return (
    <div className="flex items-center gap-1">
      <select className="select select-xs w-auto max-w-45" value="" onChange={(e) => { const r = d.savedReplies.find((x) => x.id === e.target.value); if (r) onPick(r.body); }} aria-label="Insert saved reply">
        <option value="">Saved replies{d.savedReplies.length ? ` (${d.savedReplies.length})` : ""}</option>
        {d.savedReplies.map((r) => (<option key={r.id} value={r.id}>{r.title}</option>))}
      </select>
      {text.trim().length > 0 && <Button size="xs" variant="ghost" color="neutral" onClick={onSave}>Save as reply</Button>}
    </div>
  );
}

export function ReplyComposer({ d, workspaceId, canHandle }: { d: ConversationDetailData; workspaceId: string; canHandle: boolean }) {
  const { run, pending, toast } = useActionFeedback();
  const [mode, setMode] = useState<Mode>("reply");
  const [text, setText] = useState("");
  const over = text.length > d.textMax;
  const clear = (r: { error?: string }) => { if (!r.error) setText(""); };
  const send = (resolve: boolean) => run(() => sendReply(workspaceId, d.id, text, { resolve }), clear);
  const saveAsReply = () => {
    const title = window.prompt("Name this saved reply", text.slice(0, 40));
    if (title) run(() => saveSavedReply(workspaceId, { title, body: text }));
  };

  if (!canHandle) return <div className="border-t border-base-300 px-4 py-3 text-sm text-secondary">You can read this conversation but your role can&apos;t reply.</div>;
  return (
    <div className="border-t border-base-300">
      <div className="flex gap-4 px-4" role="tablist">
        {(["reply", "note"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`border-b-2 py-2 text-sm capitalize ${mode === m ? "border-base-content font-semibold" : "border-transparent text-secondary"}`}>{m === "reply" ? "Reply" : "Note"}</button>
        ))}
      </div>
      <div className={`px-4 pb-3 pt-2 ${mode === "note" ? "bg-warning/10" : ""}`}>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "reply" ? "Type your message..." : "Internal note — only your team sees this"} className="w-full text-sm" aria-label={mode === "reply" ? "Reply" : "Internal note"} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !over) mode === "reply" ? send(false) : run(() => addInternalNote(workspaceId, d.id, text), clear); }} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {mode === "reply" ? <SavedReplies d={d} text={text} onPick={(b) => setText((t) => (t ? `${t}\n${b}` : b))} onSave={saveAsReply} /> : <span className="text-xs text-secondary">Notes never reach the customer.</span>}
          <div className="flex items-center gap-2">
            <span className={`text-xs ${over ? "font-medium text-error" : "text-secondary/70"}`}>{text.length} / {d.textMax.toLocaleString()}</span>
            {mode === "reply" ? (
              <>
                <Button size="sm" color="primary" loading={pending} disabled={over || !text.trim()} onClick={() => send(false)}>Send</Button>
                <Button size="sm" variant="outline" color="neutral" disabled={pending || over || !text.trim()} onClick={() => send(true)} title="Send and resolve">Send &amp; resolve</Button>
              </>
            ) : (
              <Button size="sm" color="primary" loading={pending} disabled={!text.trim()} onClick={() => run(() => addInternalNote(workspaceId, d.id, text), (r) => { clear(r); if (!r.error) toast.add({ title: "Note added", type: "success" }); })}>Add note</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

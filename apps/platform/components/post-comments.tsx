"use client";

import { useState } from "react";
import { Avatar, Button, Textarea } from "@wizeworks/silicaui-react";
import { addComment, resolveComment } from "@/lib/actions/approvals";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type CommentRow = { id: string; by: string; image: string | null; body: string; at: string; mine: boolean; resolved: boolean; version: number | null };

export function PostComments({ workspaceId, itemId, comments, canComment }: { workspaceId: string; itemId: string; comments: CommentRow[]; canComment: boolean }) {
  const { run, pending } = useActionFeedback();
  const [text, setText] = useState("");
  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="comments-h">
      <h2 id="comments-h" className="text-base font-semibold">Comments <span className="font-normal text-secondary/70">({comments.length})</span></h2>
      <ul className="mt-3 flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className={`flex gap-3 text-sm ${c.resolved ? "opacity-60" : ""}`}>
            <Avatar size="sm" color="neutral" alt="" src={c.image ?? undefined}>{c.by.slice(0, 2).toUpperCase()}</Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.mine ? "You" : c.by}</span><span className="text-xs text-secondary/70">{c.at}{c.version ? ` · v${c.version}` : ""}</span>
                {!c.resolved && canComment && <button type="button" className="text-xs text-secondary/70 hover:underline" onClick={() => run(() => resolveComment(workspaceId, c.id))}>Resolve</button>}
                {c.resolved && <span className="text-xs text-success">Resolved</span>}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-secondary/70">No comments yet.</li>}
      </ul>
      {canComment && (
        <form className="mt-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addComment(workspaceId, itemId, text), (r) => { if (!r.error) setText(""); }); }}>
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment for the team" className="w-full text-sm" />
          <div><Button type="submit" size="sm" color="primary" loading={pending} disabled={!text.trim()}>Comment</Button></div>
        </form>
      )}
    </section>
  );
}

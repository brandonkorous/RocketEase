"use client";

import { useState } from "react";
import { Avatar, Badge, Button } from "@wizeworks/silicaui-react";
import { addComment, resolveComment } from "@/lib/actions/approvals";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { AnchorBadge } from "./preview";
import { FIELD_LABEL, anchorKey, type Anchor, type ApprovalDetailData, type ApprovalsData, type CommentRow } from "./types";

const POST_ANCHOR: Anchor = { field: null, assetId: null };
const anchorLabel = (a: Anchor, media: { id: string; alt: string }[]) =>
  a.assetId ? `Media${media.findIndex((m) => m.id === a.assetId) >= 0 ? ` ${media.findIndex((m) => m.id === a.assetId) + 1}` : ""}` : a.field ? FIELD_LABEL[a.field] ?? a.field : "The whole post";

function Composer({ data, itemId, anchor, media, onClear, parentId, placeholder }: { data: ApprovalsData; itemId: string; anchor: Anchor; media: { id: string; alt: string }[]; onClear?: () => void; parentId?: string; placeholder: string }) {
  const { run, pending } = useActionFeedback();
  const [text, setText] = useState("");
  const post = () => run(() => addComment(data.workspaceId, itemId, text, { field: anchor.field ?? undefined, assetId: anchor.assetId ?? undefined, parentId }), (r) => { if (!r.error) { setText(""); onClear?.(); } });
  return (
    <div className="mt-2">
      {!parentId && anchorKey(anchor) !== "post" && (
        <p className="mb-1 flex items-center gap-1 text-xs text-secondary">
          On <Badge size="xs" variant="soft" color="neutral">{anchorLabel(anchor, media)}</Badge>
          <button type="button" className="underline" onClick={onClear}>clear</button>
        </p>
      )}
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); post(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="input input-sm flex-1" aria-label={placeholder} />
        <Button type="submit" size="sm" color="primary" loading={pending} disabled={!text.trim()}>Post</Button>
      </form>
    </div>
  );
}

function Comment({ c, replies, data, itemId, canComment }: { c: CommentRow; replies: CommentRow[]; data: ApprovalsData; itemId: string; canComment: boolean }) {
  const { run, pending } = useActionFeedback();
  const [replying, setReplying] = useState(false);
  return (
    <li className={`flex gap-2 text-xs ${c.resolved ? "opacity-60" : ""}`}>
      <Avatar size="xs" color="neutral" alt="" src={c.image ?? undefined}>{c.by.slice(0, 2).toUpperCase()}</Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1"><span className="font-semibold">{c.mine ? "You" : c.by}</span><span className="text-secondary/70">{c.at}</span><AnchorBadge c={c} />{c.resolved && <Badge size="xs" variant="soft" color="success">Resolved</Badge>}</span>
        <span className="block whitespace-pre-wrap">{c.body}</span>
        {replies.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1.5 border-l border-base-300 pl-2">
            {replies.map((r) => (<li key={r.id}><span className="font-semibold">{r.mine ? "You" : r.by}</span> <span className="text-secondary/70">{r.at}</span><span className="block whitespace-pre-wrap">{r.body}</span></li>))}
          </ul>
        )}
        {canComment && (
          <span className="mt-1 flex gap-2">
            <button type="button" className="text-secondary underline" onClick={() => setReplying((v) => !v)}>{replying ? "Cancel" : "Reply"}</button>
            {!c.resolved && <button type="button" className="text-secondary underline" disabled={pending} onClick={() => run(() => resolveComment(data.workspaceId, c.id))}>Resolve</button>}
          </span>
        )}
        {replying && <Composer data={data} itemId={itemId} anchor={{ field: c.field, assetId: c.assetId }} media={[]} parentId={c.id} placeholder="Reply…" onClear={() => setReplying(false)} />}
      </span>
    </li>
  );
}

/** Comment threads for the request, anchored comments grouped under what they reference (COL-002). */
export function Comments({ d, data, anchor, onAnchor }: { d: ApprovalDetailData; data: ApprovalsData; anchor: Anchor; onAnchor: (a: Anchor) => void }) {
  const [showResolved, setShowResolved] = useState(false);
  const media = d.snapshot?.media ?? [];
  const roots = d.comments.filter((c) => !c.parentId && (showResolved || !c.resolved));
  const groups = [...new Set(roots.map((c) => anchorKey(c)))].map((key) => ({ key, list: roots.filter((c) => anchorKey(c) === key) }));
  const resolvedCount = d.comments.filter((c) => !c.parentId && c.resolved).length;
  return (
    <div className="rounded-xl border border-base-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Comments <span className="rounded-full bg-base-200 px-1.5 text-xs font-normal">{d.comments.length}</span></h3>
        {resolvedCount > 0 && <button type="button" className="text-xs text-secondary underline" onClick={() => setShowResolved((v) => !v)}>{showResolved ? "Hide" : "Show"} resolved</button>}
      </div>
      {data.canComment && <Composer data={data} itemId={d.itemId} anchor={anchor} media={media} onClear={() => onAnchor(POST_ANCHOR)} placeholder="Add a comment..." />}
      {data.canComment && anchorKey(anchor) === "post" && <p className="mt-1 text-xs text-secondary/70">Click a field or image in the preview to comment on it directly.</p>}
      <div className="mt-3 flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.key}>
            {g.key !== "post" && <p className="mb-1 text-xs font-medium text-secondary/70">{anchorLabel(g.list[0], media)}</p>}
            <ul className="flex flex-col gap-3">{g.list.map((c) => (<Comment key={c.id} c={c} replies={d.comments.filter((r) => r.parentId === c.id)} data={data} itemId={d.itemId} canComment={data.canComment} />))}</ul>
          </div>
        ))}
        {roots.length === 0 && <p className="text-xs text-secondary/70">No comments yet.</p>}
      </div>
    </div>
  );
}

"use client";

import { Badge } from "@wizeworks/silicaui-react";
import { FIELD_LABEL, TIMELINE_DOT, anchorKey, type Anchor, type ApprovalDetailData, type CommentRow } from "./types";

type AnchorProps = { comments: CommentRow[]; anchor: Anchor; onAnchor: (a: Anchor) => void };

/** Open (unresolved) comments attached to one anchor. */
export const openAt = (comments: CommentRow[], a: Anchor) => comments.filter((c) => !c.resolved && !c.parentId && anchorKey(c) === anchorKey(a));

function AnchorButton({ a, comments, anchor, onAnchor, label }: AnchorProps & { a: Anchor; label: string }) {
  const n = openAt(comments, a).length;
  const active = anchorKey(anchor) === anchorKey(a);
  return (
    <button type="button" onClick={() => onAnchor(a)} aria-pressed={active} title={`Comment on ${label}`} className={`flex items-center gap-1 rounded-field px-1.5 py-0.5 text-xs ${active ? "bg-base-content text-base-100" : "text-secondary hover:bg-base-200"}`}>
      💬{n > 0 && <span className="font-semibold">{n}</span>}
    </button>
  );
}

/** A labelled, anchorable region of the post under review (COL-002). */
function Field({ field, label, children, ...rest }: AnchorProps & { field: string; label: string; children: React.ReactNode }) {
  const a = { field, assetId: null };
  const active = anchorKey(rest.anchor) === anchorKey(a);
  return (
    <div className={`rounded-field border p-2 ${active ? "border-base-content" : "border-transparent"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-secondary/70">{label}</span>
        <AnchorButton a={a} label={label} {...rest} />
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Preview({ d, ...rest }: { d: ApprovalDetailData } & AnchorProps) {
  const media = d.snapshot?.media ?? [];
  return (
    <div className="rounded-xl border border-base-300">
      {media.length > 0 && (
        <div className={`grid gap-0.5 ${media.length > 1 ? "grid-cols-2" : ""}`}>
          {media.slice(0, 4).map((m) => {
            const a = { field: null, assetId: m.id };
            const active = anchorKey(rest.anchor) === anchorKey(a);
            return (
              <button key={m.id} type="button" onClick={() => rest.onAnchor(a)} aria-pressed={active} aria-label={`Comment on ${m.alt || "this image"}`} className={`relative aspect-square bg-base-200 ${active ? "ring-2 ring-base-content ring-inset" : ""}`}>
                {m.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.url} alt={m.alt} className="h-full w-full object-cover" />}
                <span className="absolute right-1.5 top-1.5 rounded-field bg-base-100/90 px-1.5 py-0.5 text-xs">💬{openAt(rest.comments, a).length > 0 && <span className="ml-0.5 font-semibold">{openAt(rest.comments, a).length}</span>}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-col gap-1 p-2">
        <Field field="text" label={FIELD_LABEL.text} {...rest}>
          <p className="whitespace-pre-wrap text-sm leading-normal">{d.snapshot?.text || <em className="text-secondary/70">No text</em>}</p>
        </Field>
        {d.snapshot?.link && (
          <Field field="link" label={FIELD_LABEL.link} {...rest}>
            <a className="block truncate text-xs text-info" href={d.snapshot.link} target="_blank" rel="noreferrer">{d.snapshot.link}</a>
          </Field>
        )}
        {d.snapshot?.firstComment && (
          <Field field="first_comment" label={FIELD_LABEL.first_comment} {...rest}>
            <p className="whitespace-pre-wrap text-xs">{d.snapshot.firstComment}</p>
          </Field>
        )}
        {(d.snapshot?.schedule || d.scheduleOnApprove) && (
          <Field field="schedule" label={FIELD_LABEL.schedule} {...rest}>
            <p className="text-xs">{(d.snapshot?.schedule ?? d.scheduleOnApprove ?? "").replace("T", " ")}</p>
          </Field>
        )}
      </div>
    </div>
  );
}

export function Details({ d }: { d: ApprovalDetailData }) {
  const onApprove = d.scheduleOnApprove ? (d.scheduleOnApprove === "now" ? "Publish immediately" : `Schedule for ${d.scheduleOnApprove.replace("T", " ")}`) : "Nothing automatic";
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-secondary/70">Requested by</dt><dd>{d.requester}</dd><dt className="text-secondary/70">Requested</dt><dd>{d.createdAt}</dd><dt className="text-secondary/70">Due</dt><dd>{d.dueLabel ?? "—"}</dd><dt className="text-secondary/70">On approval</dt><dd>{onApprove}</dd><dt className="text-secondary/70">Note</dt><dd>{d.note ?? "—"}</dd></dl>
  );
}

export function Versions({ d }: { d: ApprovalDetailData }) {
  return (
    <div className="mt-4 rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Versions</h3>
      <ul className="mt-2 flex flex-col gap-1.5">{d.versions.map((v) => (<li key={v.id} className={`rounded-field border px-2.5 py-1.5 text-xs ${v.current ? "border-base-content" : "border-base-300"}`}>Version {v.number} {v.current && <span className="text-info">(under review)</span>}<span className="block text-xs text-secondary/70">{v.at}{v.by ? ` by ${v.by}` : ""} · {v.reason.replace("_", " ")}</span></li>))}</ul>
    </div>
  );
}

export function Timeline({ d }: { d: ApprovalDetailData }) {
  return (
    <div className="mt-4 rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Approval timeline</h3>
      <ol className="mt-3 flex flex-wrap gap-4">{d.timeline.map((t, i) => (<li key={i} className="flex min-w-27.5 flex-col items-start gap-1 text-xs"><span className={`h-4 w-4 rounded-full ${TIMELINE_DOT[t.kind] ?? "bg-base-content"}`} aria-hidden="true" /><span className="font-semibold capitalize">{t.label}</span><span className="text-secondary/70">{t.at}</span><span className="text-secondary/70">{t.by}</span></li>))}</ol>
    </div>
  );
}

export function AnchorBadge({ c }: { c: CommentRow }) {
  const label = c.assetId ? "Media" : c.field ? FIELD_LABEL[c.field] ?? c.field : null;
  return label ? <Badge size="xs" variant="soft" color="neutral">{label}</Badge> : null;
}

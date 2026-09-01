"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { deleteAsset, updateAsset, type ActionState } from "@/lib/actions/assets";
import { moveAssets } from "@/lib/actions/folders";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { daysUntil, remainingLabel } from "@/lib/rights/format";
import { NetMark } from "../net-mark";
import { ExpandButton, useMediaLightbox } from "../shared/media-lightbox";
import { formatCredits } from "@/lib/ai/usage/credits";
import { fmtBytes, fmtDate, viewableMedia, type AssetCard, type CollectionRow } from "./types";

type Props = { a: AssetCard; workspaceId: string; canEdit: boolean; timezone: string; collections: CollectionRow[]; onClose: () => void };

export function DetailPanel({ a, workspaceId, canEdit, timezone, collections, onClose }: Props) {
  const used = Object.entries(a.usedIn);
  return (
    <div className="rounded-box border border-base-300 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-base font-semibold">{a.fileName}</h2><Badge size="xs" variant="soft" color="success" className="capitalize">{a.kind}</Badge></div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-secondary/70 hover:text-base-content">✕</button>
      </div>
      <Preview a={a} />
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-secondary/70">Uploaded</dt><dd className="text-right">{fmtDate(a.createdAt, timezone)}</dd>
        <dt className="text-secondary/70">Dimensions</dt><dd className="text-right">{a.width && a.height ? `${a.width} × ${a.height}` : "—"}</dd>
        <dt className="text-secondary/70">Size</dt><dd className="text-right">{fmtBytes(a.bytes)}</dd>
        <dt className="text-secondary/70">Type</dt><dd className="text-right">{a.mimeType}</dd>
        <dt className="text-secondary/70">Scan</dt><dd className="text-right capitalize">{a.scanStatus}{a.scanNote ? ` · ${a.scanNote}` : ""}</dd>
      </dl>
      {a.generation && <Generation g={a.generation} />}
      <h3 className="mt-4 text-sm font-semibold">Used in</h3>
      {used.length ? <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{used.map(([network, n]) => (<li key={network} className="flex items-center gap-1.5"><NetMark network={network} />{n} post{n === 1 ? "" : "s"}</li>))}</ul> : <p className="mt-1 text-sm text-secondary/70">Not used in any post yet.</p>}
      <Link href={workspacePath(workspaceId, `create?asset=${a.id}`)} className="mt-2 inline-block text-sm font-medium hover:underline">+ Add to post</Link>
      {canEdit ? <EditForm a={a} workspaceId={workspaceId} collections={collections} onClose={onClose} /> : <p className="mt-4 text-sm text-secondary/70">You can view this asset but not edit it.</p>}
    </div>
  );
}

/**
 * What this image cost the CUSTOMER, in credits — the one unit the product
 * bills in, so an image and a draft are comparable.
 *
 * Deliberately not vendor dollars. This screen is workspace-scoped, and what we
 * pay Azure is cost of goods; showing it hands over our margin and anchors a
 * price. Our own spend stays on media_job, the "media job charged" log line and
 * the ceiling. "Not billed" is said out loud rather than shown as free, because
 * an unmetered job is the case worth spotting.
 */
function Generation({ g }: { g: NonNullable<AssetCard["generation"]> }) {
  return (
    <section className="mt-4" aria-labelledby="gen-info">
      <h3 id="gen-info" className="text-sm font-semibold">AI-generated</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-secondary/70">Model</dt><dd className="text-right">{g.model}</dd>
        <dt className="text-secondary/70">Credits</dt>
        <dd className="text-right">{g.credits === null ? <span className="text-secondary/70">Not billed</span> : formatCredits(g.credits)}</dd>
      </dl>
      {g.reason && <p className="mt-1 text-xs text-secondary/70">{g.reason}</p>}
    </section>
  );
}

function Preview({ a }: { a: AssetCard }) {
  const src = a.previewUrl ?? a.originalUrl;
  const { open, lightbox } = useMediaLightbox(viewableMedia([a]));
  return (
    <div className="relative mt-3 overflow-hidden rounded-lg bg-base-200">
      {a.kind === "image" && src ? (
        <button type="button" onClick={() => open(0)} className="block w-full cursor-zoom-in" aria-label={`View ${a.title ?? a.fileName} full size`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={a.altText ?? ""} className="max-h-65 w-full object-cover" />
        </button>
      ) : a.kind === "video" && a.originalUrl ? (
        <>
          <video src={a.originalUrl} controls className="max-h-65 w-full" />
          <ExpandButton onClick={() => open(0)} label={`View ${a.title ?? a.fileName} full size`} className="absolute right-2 top-2" />
        </>
      ) : (
        <div className="p-8 text-center text-sm text-secondary/70">{a.uploadStatus === "ready" ? "No preview" : "Processing…"}</div>
      )}
      {lightbox}
    </div>
  );
}

function EditForm({ a, workspaceId, collections, onClose }: { a: AssetCard; workspaceId: string; collections: CollectionRow[]; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateAsset, {});
  const { notify, run, pending: busy } = useActionFeedback();
  const [tags, setTags] = useState<string[]>(a.tags);
  // Reset when a DIFFERENT asset is selected. Depending on a.tags would reset
  // on every parent render — it is a fresh array each time — and quietly throw
  // away tags the person was part-way through editing.
  useEffect(() => setTags(a.tags), [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => notify(state), [state, notify]);
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="assetId" value={a.id} /><input type="hidden" name="tags" value={tags.join(",")} />
      <TagEditor tags={tags} onChange={setTags} />
      <div>
        <h3 className="text-sm font-semibold">Variants</h3>
        {a.renditions.length ? <ul className="mt-2 flex flex-wrap gap-2">{a.renditions.map((r) => (<li key={r.kind} className="rounded-md border border-base-300 px-2 py-1 text-xs"><span className="font-medium capitalize">{r.kind}</span> {r.width && r.height ? `${r.width}×${r.height}` : ""} {fmtBytes(r.bytes)}</li>))}</ul> : <p className="mt-1 text-xs text-secondary/70">Network-sized variants are generated when the asset is used.</p>}
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="d-title">Title</Label><Input id="d-title" name="title" size="sm" defaultValue={a.title ?? ""} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="d-alt">Alt text {a.kind === "image" && <span className="text-secondary/70">(required to publish)</span>}</Label><Textarea id="d-alt" name="altText" rows={2} defaultValue={a.altText ?? ""} placeholder="Describe the image for people who can't see it" /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="d-caption">Default caption</Label><Textarea id="d-caption" name="caption" rows={2} defaultValue={a.caption ?? ""} /></div>
      {a.kind === "image" && <ReferenceField a={a} />}
      <RightsFields a={a} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button type="submit" color="primary" loading={pending}>Save</Button>
        <Link href={workspacePath(workspaceId, `create?asset=${a.id}`)} className="btn btn-neutral btn-outline">Insert into post</Link>
        <select className="select select-sm" defaultValue={a.folderId ?? "__root"} onChange={(e) => run(() => moveAssets(workspaceId, [a.id], e.target.value === "__root" ? null : e.target.value))} aria-label="Move to collection" disabled={busy}>
          <option value="__root">No collection</option>{collections.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <Button type="button" variant="outline" color="error" disabled={busy} onClick={() => run(() => deleteAsset(workspaceId, a.id), (r) => { if (r.ok) onClose(); })}>Delete</Button>
      </div>
    </form>
  );
}

/**
 * What a model may be handed this image AS.
 *
 * Images only: a video cannot be a reference frame. `product` is the one that
 * earns its place — Sora's reference becomes the literal first frame, so this
 * is the difference between the real product on screen and a convincing
 * lookalike.
 */
function ReferenceField({ a }: { a: AssetCard }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="d-ref">Use as a reference</Label>
      <select id="d-ref" name="referenceKind" className="select select-sm" defaultValue={a.referenceKind ?? ""}>
        <option value="">Not a reference</option>
        <option value="product">Product shot</option>
        <option value="logo">Logo</option>
        <option value="style">Style reference</option>
        <option value="talent">Talent</option>
      </select>
      <p className="text-xs text-secondary/70">A product shot can open a generated clip, so the real thing is on screen rather than something that resembles it.</p>
    </div>
  );
}

/** Rights clock (M8.4): what the licence covers and when it runs out. Organic clearance rarely includes paid. */
function RightsFields({ a }: { a: AssetCard }) {
  const left = a.rightsExpiresAt ? remainingLabel(new Date(a.rightsExpiresAt)) : null;
  const expired = Boolean(a.rightsExpiresAt && daysUntil(new Date(a.rightsExpiresAt)) < 0);
  return (
    <div className="flex flex-col gap-3 rounded-box border border-base-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Rights</h3>
        {left && <Badge size="xs" variant="soft" color={expired ? "error" : "warning"}><span aria-hidden="true">{expired ? "!" : "◷"}</span> {left}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5"><Label htmlFor="d-rights">Licence / source</Label><Input id="d-rights" name="rightsNote" size="sm" defaultValue={a.rightsNote ?? ""} placeholder="License / source" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="d-exp">Expires</Label><Input id="d-exp" name="rightsExpiresAt" size="sm" type="date" defaultValue={a.rightsExpiresAt ? a.rightsExpiresAt.slice(0, 10) : ""} /></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-scope">Covers</Label>
        <select id="d-scope" name="rightsScope" className="select select-sm" defaultValue={a.rightsScope}>
          <option value="both">Organic and paid</option>
          <option value="organic">Organic only</option>
          <option value="paid">Paid only</option>
        </select>
        <p className="text-xs text-secondary/70">Promoting media cleared for organic use only is blocked. Record the paid licence in Settings → Rights and authorisations.</p>
      </div>
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const add = (v: string) => { const t = v.trim().toLowerCase(); if (t && !tags.includes(t)) onChange([...tags, t]); setAdding(false); };
  return (
    <div>
      <h3 className="text-sm font-semibold">Tags</h3>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (<span key={t} className="flex items-center gap-1 rounded-md border border-base-300 px-2 py-0.5 text-xs">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="text-secondary/70">×</button></span>))}
        {adding ? <Input size="sm" className="w-30" autoFocus placeholder="tag" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(e.currentTarget.value); } if (e.key === "Escape") setAdding(false); }} onBlur={() => setAdding(false)} /> : <button type="button" className="text-xs text-secondary hover:underline" onClick={() => setAdding(true)}>+ Add tag</button>}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Input, Radio, Textarea } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../../net-mark";
import { PlayBadge, useMediaLightbox } from "../../shared/media-lightbox";
import { LivePreview } from "../live-preview";
import { lightboxMedia, NETWORK_LABEL, type Approval, type ComposerChannel, type Method, type Reviewer } from "../types";
import type { ComposerState } from "../use-composer";

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2>{aside && <span className="text-xs text-secondary/70">{aside}</span>}</div>
      {children}
    </section>
  );
}

export function ChannelStep({ s, channels, workspaceId }: { s: ComposerState; channels: ComposerChannel[]; workspaceId: string }) {
  const publishable = channels.filter((c) => c.formats.length);
  return (
    <Section title="Select platforms" aside={`${s.selected.length} of ${publishable.length} selected`}>
      <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300">
        {channels.map((c) => {
          const on = s.selected.includes(c.id);
          const off = c.formats.length === 0;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => !off && s.toggleChannel(c.id)} disabled={off} aria-pressed={on} className={`flex w-full items-center gap-3 px-3 py-3 text-left ${off ? "opacity-50" : ""}`}>
                <NetMark network={c.network} size={28} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span><span className="block text-xs text-secondary/70">{NETWORK_LABEL[c.network] ?? c.network}{off ? " · read-only" : ""}</span></span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${on ? "border-base-content bg-base-content text-base-100" : "border-base-300"}`} aria-hidden="true">{on ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Link href={workspacePath(workspaceId, "accounts")} className="text-xs font-medium text-secondary hover:underline">+ Connect another account</Link>
    </Section>
  );
}

export function TextStep({ s }: { s: ComposerState }) {
  const textMax = Math.min(...s.selectedChannels.map((c) => c.textMax ?? Infinity), 63_206);
  return (
    <Section title="Post caption" aside={<span className={s.text.length > textMax ? "font-semibold text-error" : ""}>{s.text.length.toLocaleString()} / {Number.isFinite(textMax) ? textMax.toLocaleString() : "∞"}</span>}>
      <Textarea value={s.text} onChange={(e) => s.setText(e.target.value)} rows={8} placeholder="What do you want to say?" className="w-full text-base leading-relaxed" aria-label="Post caption" autoFocus />
      <div className="flex items-center gap-2"><button type="button" className="rounded-field border border-base-300 px-2 py-1 text-xs" onClick={() => s.setText((t) => (t.endsWith(" ") || t === "" ? t + "#" : t + " #"))}># Hashtag</button></div>
      <Input type="url" size="sm" value={s.link} onChange={(e) => s.setLink(e.target.value)} placeholder="Link (optional) https://" aria-label="Link" />
      {s.issues.length > 0 && <ul className="flex flex-col gap-1 text-xs">{s.issues.map((i, n) => (<li key={n} className={i.severity === "error" ? "text-error" : "text-secondary"}>{i.message}</li>))}</ul>}
    </Section>
  );
}

export function MediaStep({ s, onPick }: { s: ComposerState; onPick: () => void }) {
  const { open, lightbox } = useMediaLightbox(lightboxMedia(s.chosenAssets));
  return (
    <Section title="Media" aside={`${s.assetIds.length} of 10`}>
      <div className="grid grid-cols-3 gap-2">
        {s.chosenAssets.map((a, i) => (
          <div key={a.id} className="relative aspect-square overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <button type="button" onClick={() => open(i)} className="block h-full w-full cursor-zoom-in" aria-label={`View ${a.fileName} larger`}>
              {a.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.thumbUrl} alt={a.altText ?? ""} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs uppercase text-secondary/70">{a.kind}</div>}
              {a.kind === "video" && <PlayBadge />}
            </button>
            <button type="button" onClick={() => s.setAssetIds((ids) => ids.filter((x) => x !== a.id))} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white" aria-label={`Remove ${a.fileName}`}>×</button>
          </div>
        ))}
        {lightbox}
        <button type="button" onClick={onPick} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-base-300 text-sm text-secondary"><span className="text-2xl leading-none">+</span>Add media</button>
      </div>
      <p className="text-xs text-secondary/70">Media is optional for text posts. Images without alt text are flagged before publishing.</p>
    </Section>
  );
}

const METHODS: { key: Method; label: string }[] = [{ key: "now", label: "Publish now" }, { key: "schedule", label: "Schedule" }, { key: "review", label: "Request approval" }, { key: "draft", label: "Save as draft" }];

export function ScheduleStep({ s, channels, approval, reviewers, timezone, canPublish }: { s: ComposerState; channels: ComposerChannel[]; approval: Approval; reviewers: Reviewer[]; timezone: string; canPublish: boolean }) {
  const needsReview = approval.required && approval.state !== "approved";
  return (
    <>
      <LivePreview s={s} channels={channels} />
      <Section title="Schedule" aside={timezone.replace("_", " ")}>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" size="sm" value={s.date} onChange={(e) => s.setDate(e.target.value)} aria-label="Date" />
          <Input type="time" size="sm" value={s.time} onChange={(e) => s.setTime(e.target.value)} aria-label="Time" />
        </div>
        <p className="rounded-field bg-base-200 px-3 py-2 text-xs text-secondary">Best-time suggestions appear after this workspace has two weeks of analytics.</p>
      </Section>
      <Section title="Publishing method">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {METHODS.map((m) => {
            const locked = (needsReview && (m.key === "now" || m.key === "schedule")) || (!canPublish && m.key !== "review" && m.key !== "draft");
            return (<label key={m.key} className={`flex items-center gap-2 rounded-field border border-base-300 px-3 py-2 ${locked ? "opacity-50" : ""}`}><Radio name="q-method" checked={s.method === m.key} disabled={locked} onChange={() => !locked && s.setMethod(m.key)} />{m.label}</label>);
          })}
        </div>
        {needsReview && <p className="text-xs text-secondary/70">Policy &ldquo;{approval.policyName}&rdquo; requires review before scheduling.</p>}
        {s.method === "review" && (
          <select className="select select-sm w-full" value={s.reviewer} onChange={(e) => s.setReviewer(e.target.value)} aria-label="Reviewer"><option value="">Any approver</option>{reviewers.map((r) => (<option key={r.userId} value={r.userId}>{r.name} · {r.role.replace("_", " ")}</option>))}</select>
        )}
      </Section>
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Input, Label, Switch, Textarea } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../library-screen";
import { ChannelOverride } from "./channel-override";
import { HashtagSets } from "./hashtag-sets";
import { AiCaption } from "./ai-caption";
import { DisclosureSection } from "./disclosure";
import type { ComposerChannel } from "./types";
import type { ComposerState } from "./use-composer";
import { NETWORK_LABEL } from "./types";

type Props = { s: ComposerState; channels: ComposerChannel[]; workspaceId: string; onPickMedia: () => void };

export function PrimaryContent({ s, channels, workspaceId, onPickMedia }: Props) {
  const [tab, setTab] = useState("shared");
  const [advanced, setAdvanced] = useState(false);
  const shared = tab === "shared" || !s.customize;
  return (
    <section className="rounded-box border border-base-300" aria-labelledby="primary-h">
      <div className="px-5 pt-5">
        <h2 id="primary-h" className="text-base font-semibold">Primary content</h2>
        <ChannelRow s={s} channels={channels} workspaceId={workspaceId} onCustomize={(v) => { s.setCustomize(v); if (!v) setTab("shared"); }} />
        {s.customize && s.selected.length > 0 && <OverrideTabs s={s} tab={tab} setTab={setTab} />}
      </div>
      <div className="px-5 pb-5">
        {shared ? (
          <SharedFields s={s} workspaceId={workspaceId} onPickMedia={onPickMedia} />
        ) : (
          <ChannelOverride channel={channels.find((c) => c.id === tab)!} shared={s.text} value={s.overrides[tab] ?? { textOverride: null, firstComment: "", linkOverride: null }} onChange={(v) => s.setOverrides((o) => ({ ...o, [tab]: v }))} issues={s.validation[tab] ?? []} />
        )}
      </div>
      <DisclosureSection s={s} channels={channels} />
      <div className="border-t border-base-300">
        <button type="button" className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>Advanced options <span className="text-secondary/70">{advanced ? "▴" : "▾"}</span></button>
        {advanced && (
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label htmlFor="title">Internal title</Label><Input id="title" value={s.title} onChange={(e) => s.setTitle(e.target.value)} placeholder="How this post appears in the calendar" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="link">Link</Label><Input id="link" type="url" value={s.link} onChange={(e) => s.setLink(e.target.value)} placeholder="https://" /></div>
          </div>
        )}
      </div>
    </section>
  );
}

function ChannelRow({ s, channels, workspaceId, onCustomize }: { s: ComposerState; channels: ComposerChannel[]; workspaceId: string; onCustomize: (v: boolean) => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Channels">
        {channels.map((c) => {
          const on = s.selected.includes(c.id);
          const off = c.formats.length === 0;
          return (
            <button key={c.id} type="button" onClick={() => !off && s.toggleChannel(c.id)} aria-pressed={on} disabled={off} title={off ? `${c.name} is read-only` : `${c.name} (${NETWORK_LABEL[c.network] ?? c.network})`} className={`rounded-full p-0.5 transition ${on ? "ring-2 ring-base-content ring-offset-2" : "opacity-40 hover:opacity-80"} ${off ? "cursor-not-allowed" : ""}`}>
              <NetMark network={c.network} size={30} />
            </button>
          );
        })}
        <Link href={workspacePath(workspaceId, "accounts")} className="flex h-8 w-8 items-center justify-center rounded-full border border-base-300 text-secondary/70" aria-label="Connect another account">+</Link>
      </div>
      <label className="flex items-center gap-2 text-sm text-secondary">Customize by platform <Switch checked={s.customize} onCheckedChange={(v: boolean) => onCustomize(v)} /></label>
    </div>
  );
}

function OverrideTabs({ s, tab, setTab }: { s: ComposerState; tab: string; setTab: (t: string) => void }) {
  const cls = (active: boolean) => `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-base-content font-semibold" : "border-transparent text-secondary"}`;
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto border-b border-base-300" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "shared"} onClick={() => setTab("shared")} className={cls(tab === "shared")}>Shared</button>
      {s.selectedChannels.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} onClick={() => setTab(c.id)} className={cls(tab === c.id)}>
          <NetMark network={c.network} size={14} />{c.name}{s.overrides[c.id]?.textOverride != null && <span className="h-1.5 w-1.5 rounded-full bg-base-content" aria-label="overridden" />}
        </button>
      ))}
    </div>
  );
}

function SharedFields({ s, workspaceId, onPickMedia }: { s: ComposerState; workspaceId: string; onPickMedia: () => void }) {
  const textMax = Math.min(...s.selectedChannels.map((c) => c.textMax ?? Infinity), 63_206);
  const fc = s.overrides.__shared?.firstComment ?? "";
  return (
    <>
      <Label htmlFor="post-text" className="mt-5 block text-sm font-semibold">Post text</Label>
      <div className="mt-2 rounded-lg border border-base-300 focus-within:border-base-content">
        <Textarea id="post-text" value={s.text} onChange={(e) => s.setText(e.target.value)} rows={8} placeholder="What do you want to say?" className="w-full resize-y border-0 bg-transparent px-4 py-3 text-base leading-relaxed focus:outline-none" />
        <div className="flex items-center justify-between border-t border-base-300 px-3 py-2 text-xs text-secondary/70">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded p-1 hover:bg-base-200" title="Add media" onClick={onPickMedia} aria-label="Add media">🖼</button>
            <button type="button" className="rounded p-1 hover:bg-base-200" title="Insert hashtag" onClick={() => s.setText((t) => (t.endsWith(" ") || t === "" ? t + "#" : t + " #"))} aria-label="Insert hashtag">#</button>
            <HashtagSets
              workspaceId={workspaceId}
              channels={s.selectedChannels.map((c) => ({ id: c.id, name: c.name, hashtagsMax: c.hashtagsMax }))}
              text={s.text}
              firstComment={fc}
              firstCommentAvailable={s.selectedChannels.some((c) => c.firstComment)}
              onInsert={(target, next) => (target === "text" ? s.setText(() => next) : setSharedFirstComment(s, next))}
            />
            <AiCaption s={s} workspaceId={workspaceId} />
          </div>
          <span className={s.text.length > textMax ? "font-semibold text-error" : ""}>{s.text.length.toLocaleString()} / {Number.isFinite(textMax) ? textMax.toLocaleString() : "∞"}</span>
        </div>
      </div>
      <h3 className="mt-5 text-sm font-semibold">Media</h3>
      <MediaStrip s={s} onPickMedia={onPickMedia} />
      {s.selectedChannels.some((c) => c.firstComment) && (
        <>
          <Label htmlFor="first-comment" className="mt-5 block text-sm font-semibold">Add first comment <span className="font-normal text-secondary/70">(optional)</span></Label>
          <div className="mt-2 flex items-center rounded-lg border border-base-300 focus-within:border-base-content">
            <Input id="first-comment" value={fc} onChange={(e) => s.setOverrides((o) => ({ ...o, __shared: { ...(o.__shared ?? { textOverride: null, linkOverride: null, firstComment: "" }), firstComment: e.target.value } }))} placeholder="e.g. Link in bio, or a follow-up question" className="flex-1 border-0 bg-transparent focus:outline-none" />
            <span className="pr-3 text-xs text-secondary/70">{fc.length} / 1,000</span>
          </div>
        </>
      )}
    </>
  );
}

/** The shared first comment lives under the `__shared` override key. */
function setSharedFirstComment(s: ComposerState, value: string) {
  s.setOverrides((o) => ({ ...o, __shared: { ...(o.__shared ?? { textOverride: null, linkOverride: null, firstComment: "" }), firstComment: value } }));
}

function MediaStrip({ s, onPickMedia }: { s: ComposerState; onPickMedia: () => void }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
      {s.chosenAssets.map((a) => (
        <div key={a.id} className="relative aspect-square overflow-hidden rounded-lg border border-base-300 bg-base-200">
          {a.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.thumbUrl} alt={a.altText ?? ""} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs uppercase text-secondary/70">{a.kind}</div>}
          <button type="button" onClick={() => s.setAssetIds((ids) => ids.filter((x) => x !== a.id))} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white" aria-label={`Remove ${a.fileName}`}>×</button>
          {a.kind === "image" && !a.altText && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">no alt text</span>}
        </div>
      ))}
      <button type="button" onClick={onPickMedia} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-primary text-sm font-medium text-white hover:bg-primary/90"><span className="text-2xl leading-none">+</span>Add media</button>
    </div>
  );
}

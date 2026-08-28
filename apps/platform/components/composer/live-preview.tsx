"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@wizeworks/silicaui-react";
import { NetMark } from "../library-screen";
import { NETWORK_LABEL, type ComposerChannel } from "./types";
import type { ComposerState } from "./use-composer";

export function LivePreview({ s, channels }: { s: ComposerState; channels: ComposerChannel[] }) {
  const [channelId, setChannelId] = useState(s.selected[0] ?? "");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => { if (!s.selected.includes(channelId)) setChannelId(s.selected[0] ?? ""); }, [s.selected, channelId]);
  const ch = channels.find((c) => c.id === channelId);
  const text = s.customize && ch && s.overrides[ch.id]?.textOverride != null ? s.overrides[ch.id].textOverride! : s.text;

  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="preview-h">
      <div className="flex items-center justify-between">
        <h2 id="preview-h" className="text-base font-semibold">Live preview</h2>
        <div className="flex rounded-field border border-base-300 p-0.5">
          {(["desktop", "mobile"] as const).map((d) => (<button key={d} type="button" onClick={() => setDevice(d)} className={`rounded-md px-2 py-1 text-xs ${device === d ? "bg-base-200 font-semibold" : "text-secondary/70"}`} aria-pressed={device === d}>{d === "desktop" ? "🖥" : "📱"}</button>))}
        </div>
      </div>
      {s.selectedChannels.length === 0 ? (
        <p className="mt-4 text-sm text-secondary/70">Select a channel to preview.</p>
      ) : (
        <>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="select select-sm mt-3 w-auto" aria-label="Preview channel">
            {s.selectedChannels.map((c) => (<option key={c.id} value={c.id}>{NETWORK_LABEL[c.network] ?? c.network} · {c.name}</option>))}
          </select>
          {ch && <PreviewCard ch={ch} text={text} s={s} mobile={device === "mobile"} />}
          <p className="mt-3 text-center text-xs text-secondary/70">Preview approximates how your post will appear when published.</p>
        </>
      )}
      {s.issues.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5" aria-label="Validation">
          {s.issues.map((i, idx) => { const c = channels.find((x) => x.id === i.channelId); return (<li key={idx} className={`flex items-start gap-2 rounded-field px-3 py-2 text-xs ${i.severity === "error" ? "bg-error/10 text-error" : "bg-warning/10 text-warning"}`}><span className="mt-0.5">{c && <NetMark network={c.network} size={12} />}</span><span>{i.message}</span></li>); })}
        </ul>
      )}
    </section>
  );
}

function PreviewCard({ ch, text, s, mobile }: { ch: ComposerChannel; text: string; s: ComposerState; mobile: boolean }) {
  const media = s.chosenAssets.slice(0, 4);
  return (
    <div className={`mt-3 overflow-hidden rounded-xl border border-base-300 ${mobile ? "mx-auto max-w-75" : ""}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar size="sm" color="neutral" alt="" src={ch.avatarUrl ?? undefined}>{ch.name.slice(0, 2).toUpperCase()}</Avatar>
        <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-sm font-semibold">{ch.handle ?? ch.name}</div><div className="truncate text-xs text-secondary/70">{ch.name}</div></div>
        <NetMark network={ch.network} size={16} />
      </div>
      {media.length > 0 && (
        <div className={`grid ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"} gap-0.5 bg-base-200`}>
          {media.map((a) => (<div key={a.id} className="relative aspect-square">{a.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.thumbUrl} alt={a.altText ?? ""} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs uppercase text-secondary/70">{a.kind}</div>}</div>))}
        </div>
      )}
      <div className="px-3 py-2.5">
        <div className="flex gap-3 text-base text-secondary" aria-hidden="true"><span>♡</span><span>◯</span><span>➤</span></div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-normal"><span className="font-semibold">{ch.handle ?? ch.name}</span> {text || <span className="text-secondary/50">Your text will appear here.</span>}</p>
        {s.effectiveLink && ch.links !== "none" && <span className="mt-1 block truncate text-xs text-info">{s.effectiveLink}</span>}
        <p className="mt-2 text-xs text-secondary/70">Just now</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { requestCoverFrames, setCoverFrame } from "@/lib/actions/grid";
import type { GridSelected } from "@/lib/grid/types";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NETWORK_LABEL } from "./format";
import type { GridNetwork } from "@/lib/grid/layouts";

/** How long we keep asking for frames before saying the worker did not answer. */
const PULL_TIMEOUT_MS = 45_000;

type Props = { workspaceId: string; selected: GridSelected; network: GridNetwork; canEdit: boolean };

/** Pick the frame the profile shows for a video. The chosen one is what publishing sends. */
export function CoverPicker({ workspaceId, selected, network, canEdit }: Props) {
  const { post, frames, coverSupport, coverReason } = selected;
  const { run, pending, router } = useActionFeedback();
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    if (!pulling) return;
    if (frames.length > 0) { setPulling(false); return; }
    const tick = setInterval(() => router.refresh(), 2500);
    const stop = setTimeout(() => setPulling(false), PULL_TIMEOUT_MS);
    return () => { clearInterval(tick); clearTimeout(stop); };
  }, [pulling, frames.length, router]);

  if (!post.isVideo || !post.videoAssetId) return null;
  const netName = NETWORK_LABEL[network];
  const locked = post.state === "live" || !canEdit;

  return (
    <section aria-labelledby="cover-h">
      <h3 id="cover-h" className="text-sm font-semibold">Cover frame</h3>
      {coverSupport === "none" ? (
        <p className="mt-0.5 text-xs leading-relaxed text-secondary">Not settable on {netName}. {coverReason}</p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-secondary">{post.state === "live" ? `Live. ${netName} shows the cover it was sent.` : `Shown in the grid and sent to ${netName} when this publishes.`}</p>
          {frames.length > 0 ? (
            <FrameRow frames={frames} chosen={post.coverOffsetMs} disabled={locked || pending} onPick={(id) => run(() => setCoverFrame(workspaceId, post.variantId, id))} />
          ) : (
            <p className="mt-2 text-xs text-secondary">{pulling ? "Pulling frames from the video…" : "No frames pulled yet."}</p>
          )}
          {!locked && (
            <div className="mt-2 flex flex-wrap gap-2">
              {frames.length === 0 && !pulling && <Button size="sm" variant="outline" color="neutral" loading={pending} onClick={() => run(() => requestCoverFrames(workspaceId, post.videoAssetId!), () => setPulling(true))}>Pull frames</Button>}
              {post.coverOffsetMs !== null && <Button size="sm" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => setCoverFrame(workspaceId, post.variantId, null))}>Use the network's default</Button>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FrameRow({ frames, chosen, disabled, onPick }: { frames: GridSelected["frames"]; chosen: number | null; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Cover frame">
      {frames.map((f) => {
        const on = chosen === f.offsetMs;
        return (
          <button key={f.id} type="button" role="radio" aria-checked={on} aria-label={`Frame at ${(f.offsetMs / 1000).toFixed(1)} seconds`} disabled={disabled} onClick={() => onPick(f.id)} className={`relative h-16 w-12 overflow-hidden rounded-selector bg-base-200 ${on ? "outline-2 outline-offset-1 outline-base-content" : "hover:opacity-80"} disabled:cursor-not-allowed`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-0.5 right-0.5 rounded-selector bg-base-content/85 px-1 text-xs text-base-100">{Math.round(f.offsetMs / 1000)}s</span>
          </button>
        );
      })}
    </div>
  );
}

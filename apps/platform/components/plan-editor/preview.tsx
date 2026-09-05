"use client";

/*
 * The layered preview (M12.6 WP2). Live layers over the real placement
 * geometry: base media, safe-zone guide, the renderer's own resolved
 * overlays, caption cues, and an approximated audio mix. The frame says
 * plainly that the accepted render is authoritative — the browser
 * approximates type metrics and the mix, and hides neither.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { CANVAS_SPECS } from "@/lib/media/canvas/specs";
import { resolveRenderSpec } from "@/lib/media/compose/spec";
import { BASE_VARIANT_ID, DEFAULT_AUDIO, DEFAULT_CAPTIONS } from "@/lib/media/plan/types";
import { expandVariants } from "@/lib/media/plan/variants";
import { PreviewOverlays } from "./preview-overlays";
import { usePreviewAudio } from "./use-preview-audio";
import type { PlanEditorState } from "./use-plan-editor";
import type { EditorData } from "./types";

const FIT = { width: 420, height: 620 };

export function PlanPreview({ state, data }: { state: PlanEditorState; data: EditorData }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // State-backed as well: a ref mutation alone never re-runs the audio
  // effect, and the mix must be attached BEFORE the first play, not after.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);
  const [timeMs, setTimeMs] = useState(0);
  // Multi-take plans play SEQUENTIALLY (the plan's own order) — the browser's
  // stand-in for the concat assembly runs at accept.
  const [shotIndex, setShotIndex] = useState(0);

  const variant = useMemo(() => {
    const all = expandVariants(state.plan);
    return all.find((v) => v.id === BASE_VARIANT_ID) ?? all[0];
  }, [state.plan]);

  const spec = useMemo(
    () => (variant ? resolveRenderSpec({ variant, placement: state.placement, kit: data.kit }) : null),
    [variant, state.placement, data.kit],
  );

  const audio = { ...DEFAULT_AUDIO, ...state.plan.audio };
  const captions = { ...DEFAULT_CAPTIONS, ...state.plan.captions };
  usePreviewAudio({
    video: videoEl,
    voiceUrl: audio.voiceoverAssetId ? (data.assets[audio.voiceoverAssetId]?.url ?? null) : null,
    musicUrl: audio.musicAssetId ? (data.assets[audio.musicAssetId]?.url ?? null) : null,
    musicGainDb: audio.musicGainDb,
    duckDb: audio.duckDb,
  });

  if (!spec) return null;
  const scale = Math.min(FIT.width / spec.canvas.width, FIT.height / spec.canvas.height);
  const frame = { width: Math.round(spec.canvas.width * scale), height: Math.round(spec.canvas.height * scale) };
  const shots = variant?.shots ?? [];
  const shot = shots[Math.min(shotIndex, shots.length - 1)];
  const base = shot?.assetId ? data.assets[shot.assetId] : null;
  // Cue timing runs across the WHOLE piece: previous takes' planned seconds
  // plus the current take's clock — the voice does not restart per take.
  const offsetMs = shots.slice(0, Math.min(shotIndex, shots.length - 1)).reduce((sum, s) => sum + (s.durationSeconds ?? 0) * 1000, 0);
  const cue = captions.burnIn ? data.cues.find((c) => offsetMs + timeMs >= c.startMs && offsetMs + timeMs < c.endMs) : undefined;
  const acceptance = data.acceptance.find((a) => a.placement === state.placement);
  const statuses = data.statuses.filter((s) => s.placement === state.placement);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {state.plan.placements.map((p) => {
          const a = data.acceptance.find((x) => x.placement === p);
          return (
            <button
              key={p}
              type="button"
              className={`btn btn-sm ${p === state.placement ? "btn-primary" : "btn-outline"}`}
              onClick={() => state.setPlacement(p)}
            >
              {CANVAS_SPECS[p].label}
              <span className="ml-1 text-xs opacity-70">{a?.state === "accepted" ? "✓" : a?.state === "stale" ? "reopened" : "draft"}</span>
            </button>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-box border border-base-300" style={{ width: frame.width, height: frame.height, backgroundColor: spec.backgroundHex }}>
        {base?.url && base.kind === "video" && (
          <video
            key={shot?.id}
            ref={attachVideo}
            src={base.url}
            controls
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            onTimeUpdate={(e) => setTimeMs(Math.round(e.currentTarget.currentTime * 1000))}
            onEnded={(e) => {
              // Play through the takes the way assembly will join them.
              if (shotIndex < shots.length - 1) {
                setShotIndex(shotIndex + 1);
                setTimeMs(0);
                requestAnimationFrame(() => videoRef.current?.play().catch(() => {}));
              } else {
                e.currentTarget.pause();
              }
            }}
          />
        )}
        {base?.url && base.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={base.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {/* Safe zone — the region platform chrome leaves alone. */}
        <div
          aria-hidden
          className="pointer-events-none absolute border border-dashed border-info/60"
          style={{ left: spec.safe.x * scale, top: spec.safe.y * scale, width: spec.safe.width * scale, height: spec.safe.height * scale }}
        />

        <PreviewOverlays spec={spec} scale={scale} logoUrls={data.logoUrls} />

        {cue && (
          <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: (spec.canvas.height - spec.safe.y - spec.safe.height) * scale + 8 }}>
            <span className="max-w-11/12 rounded-field bg-black/80 px-2 py-1 text-center text-sm text-white">{cue.text}</span>
          </div>
        )}
      </div>

      {shots.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-secondary">
          <button type="button" className="btn btn-outline btn-xs" onClick={() => setShotIndex(Math.max(0, shotIndex - 1))} disabled={shotIndex === 0}>
            ‹
          </button>
          Take {Math.min(shotIndex, shots.length - 1) + 1} of {shots.length} — plays through in plan order; assembly joins them into one file on accept
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={() => setShotIndex(Math.min(shots.length - 1, shotIndex + 1))}
            disabled={shotIndex >= shots.length - 1}
          >
            ›
          </button>
        </div>
      )}

      <section className="rounded-box border border-base-300 bg-base-100 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              {acceptance?.state === "accepted" ? "Accepted" : acceptance?.state === "stale" ? "Reopened — the plan changed after acceptance" : "Draft — a render is a preview until you accept it"}
            </h2>
            <p className="text-xs text-secondary">Accepting flattens this placement into files and re-runs preflight. Nothing publishes from an unaccepted plan.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" color="primary" onClick={() => void state.accept(state.placement)} disabled={state.busy}>
              Accept this placement
            </Button>
            <Button size="sm" onClick={() => void state.accept()} disabled={state.busy}>
              Accept all
            </Button>
          </div>
        </div>

        {statuses.length > 0 && (
          <ul className="mb-2 text-xs text-secondary">
            {statuses.map((s) => (
              <li key={`${s.placement}-${s.variantId}`}>
                Variant {s.variantId}: {s.state === "current" ? "rendered and current" : s.state === "stale" ? "rendered, now stale" : "not rendered yet"}
              </li>
            ))}
          </ul>
        )}

        {data.issues.filter((i) => !i.placement || i.placement === state.placement).slice(0, 3).map((i) => (
          <p key={`${i.code}-${i.overlayId ?? i.placement ?? ""}`} className={`text-xs ${i.severity === "error" ? "text-error" : "text-warning"}`}>
            {i.message}
          </p>
        ))}

        <p className="mt-2 text-xs text-secondary/70">
          The browser preview approximates type metrics and the audio mix; the accepted render is authoritative.
        </p>
      </section>
    </div>
  );
}

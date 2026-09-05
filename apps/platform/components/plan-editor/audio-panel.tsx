"use client";

/*
 * Audio and captions — free layers. Ducking and bed gain are plan numbers the
 * mix reads at render; the browser preview approximates them and says so.
 * Voice-over and music are picked from the library by id; generating new audio
 * lives in the library's own panels, not here.
 */
import { DEFAULT_AUDIO, DEFAULT_CAPTIONS } from "@/lib/media/plan/types";
import type { PlanEditorState } from "./use-plan-editor";
import type { EditorData } from "./types";

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-secondary">
      <span className="w-40 shrink-0">{label}</span>
      <input type="range" className="range range-xs flex-1" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-12 text-right tabular-nums">{value} dB</span>
    </label>
  );
}

export function AudioPanel({ state, data }: { state: PlanEditorState; data: EditorData }) {
  const audio = { ...DEFAULT_AUDIO, ...state.plan.audio };
  const captions = { ...DEFAULT_CAPTIONS, ...state.plan.captions };
  const name = (id?: string) => (id ? (data.assets[id]?.fileName ?? "library asset") : "none");

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-3 text-sm font-semibold">Audio &amp; captions</h2>
      <p className="mb-2 text-xs text-secondary">
        Voice-over: {name(audio.voiceoverAssetId)} · Music: {name(audio.musicAssetId)} — pick or generate audio in the library; the plan
        references it by id.
      </p>
      <div className="flex flex-col gap-2">
        <Slider label="Music bed gain" value={audio.musicGainDb} min={-60} max={0} onChange={(v) => state.setAudio({ musicGainDb: v })} />
        <Slider label="Duck under the voice" value={audio.duckDb} min={0} max={40} onChange={(v) => state.setAudio({ duckDb: v })} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="checkbox checkbox-xs" checked={captions.burnIn} onChange={(e) => state.setCaptions({ burnIn: e.target.checked })} />
          Burn captions into the pixels (default — social autoplays muted)
        </label>
        <label className="flex items-center gap-1 text-xs text-secondary">
          Language
          <input className="input input-sm w-16" value={captions.language} onChange={(e) => state.setCaptions({ language: e.target.value })} />
        </label>
      </div>
    </section>
  );
}

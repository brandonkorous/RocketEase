"use client";

/*
 * Shots — the ONE paid edit. Direction and duration are plan fields (free);
 * "Regenerate" is a spend, so the button's dialog shows the model, the reason
 * and the credits BEFORE anything runs, and a finished take is ADOPTED by the
 * person, never swapped in behind their back.
 */
import { useState } from "react";
import { Button, Textarea } from "@wizeworks/silicaui-react";
import { adoptShotAsset, previewShotGeneration, regenerateShot, shotJobStatus, type ShotPreview } from "@/lib/actions/ad-plan-shots";
import { generateAllTakes, previewAllTakes, type TakesPreview } from "@/lib/actions/ad-plan-takes";
import { MEDIA_KIND_OF } from "@rocketease/media";
import { planShotDurations, plannedSeconds, reshapeShots } from "@/lib/media/plan/duration";
import type { Shot } from "@/lib/media/plan/types";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { PlanEditorState } from "./use-plan-editor";
import type { EditorData } from "./types";

type Regen = { shotId: string; preview?: ShotPreview; jobId?: string; jobState?: string; newAssetId?: string };

/** Real content lengths a person picks; the planner splits them into takes. */
const TARGET_LENGTHS = [15, 20, 30];

export function ShotsPanel({ state, data }: { state: PlanEditorState; data: EditorData }) {
  const { notify, router } = useActionFeedback();
  const [regen, setRegen] = useState<Regen | null>(null);
  const [batch, setBatch] = useState<{ preview?: TakesPreview; started?: number } | null>(null);
  const ids = { workspaceId: data.workspaceId, contentItemId: data.contentItemId };
  const current = plannedSeconds(state.plan);

  const update = (id: string, change: Partial<Shot>) => state.setShots(state.plan.shots.map((s) => (s.id === id ? { ...s, ...change } : s)));

  const setLength = (target: number) => {
    const segments = planShotDurations(target, data.takeSeconds);
    if ("error" in segments) return notify({ error: segments.error });
    state.setShots(reshapeShots(state.plan, segments));
  };

  const openBatch = async () => {
    // The worker reads shots from the row, so the plan must be saved first.
    if ((state.dirty || !data.planExists) && !(await state.save())) return;
    setBatch({});
    setBatch({ preview: await previewAllTakes(ids) });
  };

  const runBatch = async () => {
    const result = await generateAllTakes(ids);
    notify(result);
    if (result.jobs) setBatch({ started: result.jobs.length });
  };

  const openRegen = async (shotId: string) => {
    setRegen({ shotId });
    setRegen({ shotId, preview: await previewShotGeneration({ ...ids, shotId }) });
  };

  const runRegen = async (shotId: string) => {
    // The plan must be saved first — the worker reads the shot from the row.
    if (state.dirty && !(await state.save())) return;
    const result = await regenerateShot({ ...ids, shotId });
    notify(result);
    if (result.mediaJobId) setRegen({ shotId, jobId: result.mediaJobId, jobState: "queued" });
  };

  const checkRegen = async (r: Regen) => {
    if (!r.jobId) return;
    const status = await shotJobStatus({ workspaceId: data.workspaceId, mediaJobId: r.jobId });
    if ("error" in status) return notify({ error: status.error });
    if (status.state === "failed") notify({ error: status.errorNote ?? "The generation failed. Nothing was billed for a failed take." });
    setRegen({ ...r, jobState: status.state, newAssetId: status.assetId });
  };

  const adopt = async (r: Regen) => {
    if (!r.newAssetId) return;
    const result = await adoptShotAsset({ ...ids, shotId: r.shotId, assetId: r.newAssetId });
    notify(result);
    if (!result.error) {
      update(r.shotId, { assetId: r.newAssetId });
      setRegen(null);
      router.refresh();
    }
  };

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-2 text-sm font-semibold">Shots</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-secondary">Length</span>
        {TARGET_LENGTHS.map((t) => (
          <button key={t} type="button" className={`btn btn-xs ${current === t ? "btn-primary" : "btn-outline"}`} onClick={() => setLength(t)}>
            {t}s
          </button>
        ))}
        <span className="text-xs text-secondary">
          now {current}s in {state.plan.shots.length} take{state.plan.shots.length === 1 ? "" : "s"}
        </span>
        {data.regenEnabled && (
          <Button size="sm" className="ml-auto" onClick={() => void openBatch()} disabled={state.busy}>
            Generate all missing takes…
          </Button>
        )}
      </div>

      {batch && (
        <div className="mb-3 rounded-field bg-base-200 p-3 text-sm">
          {batch.started !== undefined ? (
            <p>
              Generating {batch.started} take{batch.started === 1 ? "" : "s"} — a few minutes each. Adopt each one from its shot row as it
              lands; accepting then joins them into one video.
            </p>
          ) : !batch.preview ? (
            <p>Checking what this would cost…</p>
          ) : "error" in batch.preview ? (
            <p className="text-error">{batch.preview.error}</p>
          ) : (
            <>
              <p className="font-medium">{batch.preview.totalLine}</p>
              <ul className="mt-1 text-xs text-secondary">
                {batch.preview.takes.map((t) => (
                  <li key={t.shotId} className={t.error ? "text-warning" : undefined}>
                    {t.label}: {t.error ?? t.credits}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button size="sm" color="primary" onClick={() => void runBatch()} disabled={batch.preview.ready === 0}>
                  Generate {batch.preview.ready} take{batch.preview.ready === 1 ? "" : "s"}
                </Button>
                <Button size="sm" onClick={() => setBatch(null)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
          {batch.started !== undefined && (
            <Button size="sm" className="mt-2" onClick={() => setBatch(null)}>
              Close
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {state.plan.shots.map((shot, i) => (
          <div key={shot.id} className="rounded-field border border-base-300 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-secondary">
                Shot {i + 1} · {MEDIA_KIND_OF[shot.jobKind] === "video" ? "video" : "still"}
                {shot.assetId ? ` · ${data.assets[shot.assetId]?.fileName ?? "library asset"}` : " · not generated yet"}
              </span>
              {data.regenEnabled && (
                <Button size="sm" onClick={() => void openRegen(shot.id)}>
                  Regenerate…
                </Button>
              )}
            </div>
            <Textarea
              value={shot.direction}
              onChange={(e) => update(shot.id, { direction: e.target.value })}
              placeholder="What the model is told to make. Prices and CTAs stay out — they're composited."
              rows={2}
            />
            {MEDIA_KIND_OF[shot.jobKind] === "video" && (
              <label className="mt-2 flex items-center gap-2 text-xs text-secondary">
                Shot length (seconds)
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="input input-sm w-20"
                  value={shot.durationSeconds ?? 5}
                  onChange={(e) => update(shot.id, { durationSeconds: Number(e.target.value) || undefined })}
                />
              </label>
            )}

            {regen?.shotId === shot.id && (
              <div className="mt-3 rounded-field bg-base-200 p-3 text-sm">
                {!regen.jobId && !regen.preview && <p>Checking what this would cost…</p>}
                {!regen.jobId && regen.preview && "error" in regen.preview && <p className="text-error">{regen.preview.error}</p>}
                {!regen.jobId && regen.preview && !("error" in regen.preview) && (
                  <>
                    <p className="font-medium">{regen.preview.credits}</p>
                    <p className="mt-1 text-xs text-secondary">
                      {regen.preview.model} — {regen.preview.reason}
                      {regen.preview.roundedNote ? ` ${regen.preview.roundedNote}` : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" color="primary" onClick={() => void runRegen(shot.id)}>
                        Generate a new take
                      </Button>
                      <Button size="sm" onClick={() => setRegen(null)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
                {regen.jobId && (
                  <>
                    <p>
                      {regen.jobState === "succeeded"
                        ? "The new take is ready."
                        : regen.jobState === "failed"
                          ? "The generation failed — nothing was billed."
                          : "Generating… this takes a few minutes. The current take stays until you adopt the new one."}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {regen.jobState === "succeeded" && regen.newAssetId ? (
                        <Button size="sm" color="primary" onClick={() => void adopt(regen)}>
                          Adopt this take
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => void checkRegen(regen)}>
                          Check progress
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setRegen(null)}>
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

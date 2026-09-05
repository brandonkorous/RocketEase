"use client";

/*
 * The plan editor shell (M12.6 WP3): form on the left, layered preview on the
 * right. The one banner promise, kept mechanically underneath: edits here
 * re-run a composite and bill nothing; only regenerating a shot spends, and
 * that button shows its price first.
 */
import { Button } from "@wizeworks/silicaui-react";
import { AudioPanel } from "./audio-panel";
import { CopyPanel } from "./copy-panel";
import { PlanPreview } from "./preview";
import { ShotsPanel } from "./shots-panel";
import { usePlanEditor } from "./use-plan-editor";
import { VariantsPanel } from "./variants-panel";
import type { EditorData } from "./types";

export function PlanEditor({ data }: { data: EditorData }) {
  const state = usePlanEditor(data);

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{state.plan.title}</h1>
          <p className="text-sm text-secondary">
            Edits to copy, layout, captions and audio are free — they re-run a composite, not a generation.
            {state.dirty ? " Unsaved changes." : ""}
          </p>
        </div>
        <Button color="primary" onClick={() => void state.save()} disabled={state.busy || (!state.dirty && data.planExists)}>
          {data.planExists ? "Save plan" : "Start this plan"}
        </Button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <CopyPanel state={state} />
          <ShotsPanel state={state} data={data} />
          <AudioPanel state={state} data={data} />
          <VariantsPanel state={state} />
        </div>
        <PlanPreview state={state} data={data} />
      </div>
    </div>
  );
}

"use client";

/*
 * Plan editor state (M12.6). One local copy of the plan, patched by the
 * panels; Save persists it; Accept saves first (accepting words on the screen
 * that differ from the row would stamp the wrong fingerprint), then records
 * the acceptance and queues the flatten. Everything here is a $0 edit except
 * regenerate, which lives in shots-panel with its own estimate-first dialog.
 */
import { useCallback, useMemo, useState } from "react";
import { acceptAdPlan, saveAdPlan } from "@/lib/actions/ad-plan";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { Placement } from "@/lib/media/canvas/specs";
import type { AdPlan, AudioPlan, CaptionPlan, Overlay, Shot, VariantAxis } from "@/lib/media/plan/types";
import { DEFAULT_AUDIO, DEFAULT_CAPTIONS } from "@/lib/media/plan/types";
import type { EditorData } from "./types";

export type PlanPatch = Partial<Pick<AdPlan, "hook" | "title" | "placements">>;

export function usePlanEditor(data: EditorData) {
  const { notify, router, pending } = useActionFeedback();
  const [plan, setPlan] = useState<AdPlan>(data.plan);
  const [savedJson, setSavedJson] = useState(() => (data.planExists ? JSON.stringify(data.plan) : ""));
  const [placement, setPlacement] = useState<Placement>(data.plan.placements[0]);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(() => JSON.stringify(plan) !== savedJson, [plan, savedJson]);

  const patch = useCallback((p: PlanPatch) => setPlan((prev) => ({ ...prev, ...p })), []);
  const setOverlays = useCallback((overlays: Overlay[]) => setPlan((prev) => ({ ...prev, overlays })), []);
  const setShots = useCallback((shots: Shot[]) => setPlan((prev) => ({ ...prev, shots })), []);
  const setVariants = useCallback((variants: VariantAxis[]) => setPlan((prev) => ({ ...prev, variants })), []);
  const setAudio = useCallback(
    (change: Partial<AudioPlan>) => setPlan((prev) => ({ ...prev, audio: { ...DEFAULT_AUDIO, ...prev.audio, ...change } })),
    [],
  );
  const setCaptions = useCallback(
    (change: Partial<CaptionPlan>) => setPlan((prev) => ({ ...prev, captions: { ...DEFAULT_CAPTIONS, ...prev.captions, ...change } })),
    [],
  );

  /** Persist the plan as it stands. Free — a composite, never a generation. */
  const save = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await saveAdPlan({ workspaceId: data.workspaceId, contentItemId: data.contentItemId, plan });
      notify(result);
      if ("error" in result && result.error) return false;
      setSavedJson(JSON.stringify(plan));
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }, [data.workspaceId, data.contentItemId, plan, notify, router]);

  /** Accept one placement (or all): save if needed, then stamp and flatten. */
  const accept = useCallback(
    async (target?: Placement) => {
      setBusy(true);
      try {
        if ((dirty || !data.planExists) && !(await save())) return;
        const result = await acceptAdPlan({ workspaceId: data.workspaceId, contentItemId: data.contentItemId, placement: target });
        notify(result);
        if (!("error" in result && result.error)) router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [data.workspaceId, data.contentItemId, data.planExists, dirty, save, notify, router],
  );

  return {
    plan,
    dirty,
    busy: busy || pending,
    placement,
    setPlacement,
    patch,
    setOverlays,
    setShots,
    setVariants,
    setAudio,
    setCaptions,
    save,
    accept,
  };
}

export type PlanEditorState = ReturnType<typeof usePlanEditor>;

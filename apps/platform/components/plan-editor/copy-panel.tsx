"use client";

/*
 * Copy and layout: the hook, and one row per type overlay. Anchors snap to the
 * safe zone's nine positions (M12.6 decision: presets first, free drag only if
 * dogfooding demands it) — which is also why nothing here can land under
 * platform chrome.
 */
import { Input } from "@wizeworks/silicaui-react";
import { ANCHORS, type Anchor } from "@/lib/media/canvas/geometry";
import { textOverlay } from "@/lib/media/plan/starter";
import { TEXT_ROLES, TEXT_ROLE_LABELS, type Overlay, type TextRole } from "@/lib/media/plan/types";
import type { PlanEditorState } from "./use-plan-editor";

const anchorLabel = (a: Anchor) => a.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

function AnchorSelect({ value, onChange }: { value: Anchor; onChange: (a: Anchor) => void }) {
  return (
    <select className="select select-sm" value={value} onChange={(e) => onChange(e.target.value as Anchor)} aria-label="Position">
      {ANCHORS.map((a) => (
        <option key={a} value={a}>
          {anchorLabel(a)}
        </option>
      ))}
    </select>
  );
}

export function CopyPanel({ state }: { state: PlanEditorState }) {
  const texts = state.plan.overlays.filter((o): o is Extract<Overlay, { kind: "text" }> => o.kind === "text");
  const missingRoles = TEXT_ROLES.filter((r) => !texts.some((t) => t.role === r));

  const update = (id: string, change: Partial<Extract<Overlay, { kind: "text" }>>) =>
    state.setOverlays(state.plan.overlays.map((o) => (o.id === id && o.kind === "text" ? { ...o, ...change } : o)));

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-3 text-sm font-semibold">Copy</h2>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-secondary">Hook — on screen from the first frame</span>
        <Input value={state.plan.hook} onChange={(e) => state.patch({ hook: e.target.value })} placeholder="The first thing anyone reads" />
      </label>

      <div className="flex flex-col gap-2">
        {texts.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-secondary">{TEXT_ROLE_LABELS[t.role]}</span>
            <Input value={t.text} onChange={(e) => update(t.id, { text: e.target.value })} className="min-w-0 flex-1" />
            <AnchorSelect value={t.anchor} onChange={(anchor) => update(t.id, { anchor })} />
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              aria-label={`Remove ${TEXT_ROLE_LABELS[t.role]}`}
              onClick={() => state.setOverlays(state.plan.overlays.filter((o) => o.id !== t.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {missingRoles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {missingRoles.map((role: TextRole) => (
            <button
              key={role}
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => state.setOverlays([...state.plan.overlays, textOverlay(role, "")])}
            >
              + {TEXT_ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

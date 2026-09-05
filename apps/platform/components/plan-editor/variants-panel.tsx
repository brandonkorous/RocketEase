"use client";

/*
 * Variants — one axis of deliberate difference. Each value is ONE variant that
 * differs from the base in exactly that respect; never a cross product,
 * because a test across two axes at once attributes nothing.
 */
import { Input } from "@wizeworks/silicaui-react";
import { VARIANT_AXES, VARIANT_AXIS_LABELS, type VariantAxis, type VariantAxisKind } from "@/lib/media/plan/types";
import type { PlanEditorState } from "./use-plan-editor";

const axisId = (kind: VariantAxisKind) => `axis-${kind}`;

export function VariantsPanel({ state }: { state: PlanEditorState }) {
  const axes = state.plan.variants;

  const setAxis = (kind: VariantAxisKind, values: string[]) => {
    const cleaned = values.filter((v) => v.trim().length > 0).slice(0, 4);
    const others = axes.filter((a) => a.kind !== kind);
    const next: VariantAxis[] = cleaned.length ? [...others, { id: axisId(kind), kind, values: cleaned }] : others;
    state.setVariants(next);
  };

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-1 text-sm font-semibold">Variants</h2>
      <p className="mb-3 text-xs text-secondary">Alternatives to the base, one axis at a time — so an A/B result means something.</p>
      <div className="flex flex-col gap-3">
        {VARIANT_AXES.filter((k) => k !== "opening_frame").map((kind) => {
          const axis = axes.find((a) => a.kind === kind);
          const values = axis?.values ?? [];
          return (
            <div key={kind}>
              <span className="mb-1 block text-xs text-secondary">{VARIANT_AXIS_LABELS[kind]} alternatives (up to 4)</span>
              <div className="flex flex-col gap-1">
                {[...values, ""].slice(0, 4).map((v, i) => (
                  <Input
                    key={`${kind}-${i}`}
                    value={v}
                    placeholder={i === values.length ? `Another ${VARIANT_AXIS_LABELS[kind].toLowerCase()}…` : ""}
                    onChange={(e) => {
                      const next = [...values];
                      next[i] = e.target.value;
                      setAxis(kind, next);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

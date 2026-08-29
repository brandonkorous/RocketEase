"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@wizeworks/silicaui-react";
import type { AiDraftState, DraftVariant } from "@/lib/ai/drafts";

export type AiDraftButtonProps = {
  /** Server action that returns suggestions. Called when the popover opens, and on "Try again". */
  load: () => Promise<AiDraftState>;
  /** Inserts the chosen text into the field the person is editing. */
  onUse: (text: string) => void;
  /** Fires after a pick — wire `recordDraftUsed` here. */
  onUsed?: () => void;
  /** Trigger label. Default "Draft with AI". */
  label?: string;
  /** Popover heading. Default "Suggestions to edit". */
  title?: string;
  size?: "xs" | "sm";
  align?: "start" | "center" | "end";
  disabled?: boolean;
};

/** Build-time flag; with it unset the button never renders. */
export const AI_UI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "1";

function Variant({ v, onPick }: { v: DraftVariant; onPick: () => void }) {
  return (
    <li className="rounded-field border border-base-300 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-secondary">{v.label}</span>
        <Button size="xs" variant="outline" color="neutral" onClick={onPick}>Use this</Button>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{v.text}</p>
      {v.note && <Badge size="xs" variant="soft" color="warning" className="mt-1">{v.note}</Badge>}
    </li>
  );
}

/**
 * AI drafts, a person presses send: this only ever hands text back to the
 * caller through `onUse`. It never saves, publishes, spends, or replies.
 */
export function AiDraftButton({ load, onUse, onUsed, label = "Draft with AI", title = "Suggestions to edit", size = "xs", align = "start", disabled }: AiDraftButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AiDraftState | null>(null);
  const [pending, start] = useTransition();

  if (!AI_UI_ENABLED) return null;

  const fetchDrafts = () => start(async () => setState(await load()));
  const change = (o: boolean) => {
    setOpen(o);
    if (o && !state && !pending) fetchDrafts();
  };
  const pick = (text: string) => {
    onUse(text);
    onUsed?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger>
        <Button size={size} variant="ghost" color="neutral" disabled={disabled}>{label}</Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-100 p-3">
        <PopoverTitle className="text-sm font-semibold">{title}</PopoverTitle>
        {pending && <p className="mt-2 text-sm text-secondary">Drafting…</p>}
        {!pending && state?.error && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-sm text-error">{state.error}</p>
            <div><Button size="xs" variant="outline" color="neutral" onClick={fetchDrafts}>Try again</Button></div>
          </div>
        )}
        {!pending && state?.variants?.length ? (
          <>
            <ul className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto">
              {state.variants.map((v) => (<Variant key={v.id} v={v} onPick={() => pick(v.text)} />))}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-base-300 pt-2">
              <span className="text-xs text-secondary/70">Drafts only. You edit and send.</span>
              <Button size="xs" variant="ghost" color="neutral" onClick={fetchDrafts}>Redraft</Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertContent, Button } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import type { ComposerProps } from "../index";
import { MediaPicker } from "../media-picker";
import { useComposer } from "../use-composer";
import { ChannelStep, MediaStep, ScheduleStep, TextStep } from "./steps";

const STEPS = ["Channels", "Text", "Media", "Schedule"] as const;
const LABEL = { now: "Publish now", draft: "Save as draft", review: "Request approval", schedule: "Schedule" } as const;

/**
 * Mobile quick compose (flows.md): the same composer state as the desktop
 * three-pane view, walked one step at a time in a single column.
 */
export function QuickCompose(props: ComposerProps) {
  const { workspaceId, timezone, item, channels, assets, canPublish, approval, reviewers } = props;
  const s = useComposer({ workspaceId, timezone, item, channels, assets, approval });
  const [step, setStep] = useState(item.channelIds.length ? 1 : 0);
  const [picker, setPicker] = useState(false);
  const last = step === STEPS.length - 1;
  const nextDisabled = (step === 0 && s.selected.length === 0) || (step === 1 && !s.text.trim() && s.assetIds.length === 0);
  const blocking = s.issues.filter((i) => i.severity === "error");

  return (
    <div className="mx-auto flex w-full max-w-160 flex-col gap-4 px-4 py-4 pb-28">
      <div className="flex items-center gap-3">
        <Link href={workspacePath(workspaceId, "home")} className="text-lg" aria-label="Back to Home">←</Link>
        <div className="min-w-0 flex-1"><h1 className="text-xl font-bold tracking-tight">Create post</h1><p className="text-sm text-secondary">Build, customize, and publish content.</p></div>
        <Link href={workspacePath(workspaceId, `create?item=${item.id}`)} className="text-xs font-medium text-secondary hover:underline">Full editor</Link>
      </div>
      <ol className="flex items-center gap-1" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1">
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} className={`h-1 w-full rounded-full ${i <= step ? "bg-base-content" : "bg-base-300"}`} aria-label={`${label}${i === step ? " (current)" : ""}`} aria-current={i === step ? "step" : undefined} />
            <span className={`text-xs ${i === step ? "font-semibold" : "text-secondary/70"}`}>{label}</span>
          </li>
        ))}
      </ol>
      <span className="text-xs text-secondary/70" aria-live="polite">{s.save.saving ? "Saving…" : s.save.error ?? (s.save.savedAt ? "Draft saved" : "")}</span>
      {s.submitError && (<Alert color="error" role="alert"><AlertContent>{s.submitError}</AlertContent></Alert>)}

      {step === 0 && <ChannelStep s={s} channels={channels} workspaceId={workspaceId} />}
      {step === 1 && <TextStep s={s} />}
      {step === 2 && <MediaStep s={s} onPick={() => setPicker(true)} />}
      {step === 3 && <ScheduleStep s={s} channels={channels} approval={approval} reviewers={reviewers} timezone={timezone} canPublish={canPublish} />}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-base-300 bg-base-100 px-4 py-3 md:bottom-0">
        <div className="mx-auto flex max-w-160 items-center gap-2">
          {step > 0 && <Button variant="outline" color="neutral" onClick={() => setStep(step - 1)} disabled={s.pending}>Back</Button>}
          <span className="flex-1" />
          {last ? (
            <>
              <Button variant="outline" color="neutral" onClick={() => s.submit("draft")} disabled={s.pending}>Save draft</Button>
              <Button color="primary" onClick={() => s.submit(s.method)} loading={s.pending} disabled={(s.method !== "review" && !canPublish) || s.selected.length === 0 || (s.method !== "draft" && blocking.length > 0)}>{LABEL[s.method]}</Button>
            </>
          ) : (
            <Button color="primary" onClick={() => setStep(step + 1)} disabled={nextDisabled}>Next</Button>
          )}
        </div>
      </div>
      {picker && <MediaPicker assets={assets} selected={s.assetIds} onClose={() => setPicker(false)} onChange={s.setAssetIds} workspaceId={workspaceId} />}
    </div>
  );
}

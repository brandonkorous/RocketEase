"use client";

import type { ValidationIssue } from "@rocketease/providers";
import { Input, Label, Switch, Textarea } from "@wizeworks/silicaui-react";
import type { ComposerChannel, Override } from "./types";

export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {issues.map((i, idx) => (<li key={idx} className={`rounded-field px-3 py-2 text-xs ${i.severity === "error" ? "bg-error/10 text-error" : "bg-warning/10 text-warning"}`}>{i.message}</li>))}
    </ul>
  );
}

export function ChannelOverride({ channel, shared, value, onChange, issues }: { channel: ComposerChannel; shared: string; value: Override; onChange: (v: Override) => void; issues: ValidationIssue[] }) {
  const overriding = value.textOverride != null;
  const current = overriding ? value.textOverride! : shared;
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{channel.name} text</Label>
        <label className="flex items-center gap-2 text-xs text-secondary">Override shared text <Switch checked={overriding} onCheckedChange={(v: boolean) => onChange({ ...value, textOverride: v ? shared : null })} /></label>
      </div>
      <Textarea rows={7} value={current} disabled={!overriding} onChange={(e) => onChange({ ...value, textOverride: e.target.value })} className="mt-2 w-full" />
      <div className="mt-1 text-right text-xs text-secondary/70">{current.length} / {channel.textMax?.toLocaleString() ?? "∞"}</div>
      {channel.firstComment && (
        <>
          <Label htmlFor={`fc-${channel.id}`} className="mt-4 block text-sm font-semibold">First comment</Label>
          <Input id={`fc-${channel.id}`} value={value.firstComment} onChange={(e) => onChange({ ...value, firstComment: e.target.value })} className="mt-2" />
        </>
      )}
      <IssueList issues={issues} />
    </div>
  );
}

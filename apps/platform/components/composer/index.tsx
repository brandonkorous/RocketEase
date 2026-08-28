"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertContent, Button } from "@wizeworks/silicaui-react";
import { deleteDraft } from "@/lib/actions/content";
import { workspacePath } from "@/lib/nav";
import { DestinationPanel } from "./destination-panel";
import { LivePreview } from "./live-preview";
import { MediaPicker } from "./media-picker";
import { PrimaryContent } from "./primary-content";
import type { Approval, ComposerAsset, ComposerChannel, ComposerItem, Reviewer } from "./types";
import { useComposer } from "./use-composer";

export type { ComposerAsset, ComposerChannel, ComposerItem } from "./types";

type Props = { workspaceId: string; timezone: string; item: ComposerItem; channels: ComposerChannel[]; assets: ComposerAsset[]; canPublish: boolean; approval: Approval; reviewers: Reviewer[] };

const LABEL = { now: "Publish now", draft: "Save as draft", review: "Request approval →", schedule: "Review & schedule →" } as const;

export function Composer(props: Props) {
  const { workspaceId, timezone, item, channels, assets, canPublish, approval, reviewers } = props;
  const s = useComposer({ workspaceId, timezone, item, channels, assets, approval });
  const [picker, setPicker] = useState(false);
  const [deleting, startDelete] = useTransition();
  const onDelete = () => { if (confirm("Delete this draft?")) startDelete(async () => { await deleteDraft(workspaceId, item.id); s.router.push(workspacePath(workspaceId, "calendar")); }); };

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-5 lg:px-8">
      <nav className="text-sm text-secondary/70" aria-label="Breadcrumb"><Link href={workspacePath(workspaceId, "content")} className="hover:underline">Content</Link> <span className="mx-1">›</span> <span className="text-base-content">Create post</span></nav>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="app-title">Create post</h1><p className="mt-1 text-base text-secondary">Build, customize, and publish content across your social channels.</p></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary/70" aria-live="polite">{s.save.saving ? "Saving…" : s.save.error ?? (s.save.savedAt ? "Draft saved" : "")}</span>
          <Button variant="outline" color="neutral" onClick={() => s.submit("draft")} disabled={s.pending}>Save draft</Button>
          <Button variant="outline" color="neutral" shape="square" aria-label="More actions" onClick={onDelete} disabled={deleting}>···</Button>
          <Button color="primary" onClick={() => s.submit(s.method)} loading={s.pending} disabled={(s.method !== "review" && !canPublish) || s.selected.length === 0}>{LABEL[s.method]}</Button>
        </div>
      </div>
      {s.submitError && (<Alert color="error" role="alert" className="mt-4"><AlertContent>{s.submitError}</AlertContent></Alert>)}
      {item.approvalState === "changes_requested" && (<Alert color="warning" className="mt-4"><AlertContent>Changes were requested on this post. Address them, then request approval again.</AlertContent></Alert>)}
      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px_260px]">
        <PrimaryContent s={s} channels={channels} workspaceId={workspaceId} onPickMedia={() => setPicker(true)} />
        <LivePreview s={s} channels={channels} />
        <DestinationPanel s={s} channels={channels} approval={approval} reviewers={reviewers} timezone={timezone} />
      </div>
      {picker && <MediaPicker assets={assets} selected={s.assetIds} onClose={() => setPicker(false)} onChange={s.setAssetIds} workspaceId={workspaceId} />}
    </div>
  );
}

"use client";

import { AiDraftButton } from "@/components/ai/ai-draft-button";
import { draftCaptionVariants, recordDraftUsed } from "@/lib/actions/ai";
import type { ComposerState } from "./use-composer";

/** Caption variants for the selected channels. The person edits and schedules; nothing is saved here. */
export function AiCaption({ s, workspaceId }: { s: ComposerState; workspaceId: string }) {
  const channels = s.selectedChannels.map((c) => c.id);
  return (
    <AiDraftButton
      label="Draft with AI"
      title="Caption suggestions to edit"
      disabled={channels.length === 0 || s.text.trim().length === 0}
      load={() => draftCaptionVariants({ workspaceId, text: s.text, channels })}
      onUse={(text) => s.setText(() => text)}
      onUsed={() => void recordDraftUsed(workspaceId, "caption")}
    />
  );
}

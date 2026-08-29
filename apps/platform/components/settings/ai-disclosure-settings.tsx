"use client";

import { useState } from "react";
import { Label, Switch } from "@wizeworks/silicaui-react";
import { setRequireAiDisclosure } from "@/lib/actions/settings/ai-disclosure";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; initial: boolean; canEdit: boolean };

/**
 * When on, a post declaring synthetic media can't publish to a destination that
 * offers no way to label it (composer shows the block; the worker re-checks).
 */
export function AiDisclosureSettings({ workspaceId, initial, canEdit }: Props) {
  const { run, pending } = useActionFeedback();
  const [on, setOn] = useState(initial);
  const toggle = (v: boolean) => {
    setOn(v);
    run(() => setRequireAiDisclosure({ workspaceId, required: v }));
  };
  return (
    <section className="mt-8 max-w-180 border-t border-base-300 pt-6">
      <h2 className="text-sm font-semibold">AI disclosure</h2>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        Authors declare AI-generated media on every post. TikTok, YouTube and Instagram take a label through their API; the rest get a line added to the copy.
      </p>
      <div className="mt-4 flex items-start gap-3">
        <Switch id="require-ai-disclosure" checked={on} disabled={!canEdit || pending} onCheckedChange={toggle} />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="require-ai-disclosure">Require disclosure before publishing</Label>
          <span className="text-xs text-secondary/70">Blocks synthetic-media posts on destinations that can&rsquo;t carry a label, instead of warning.</span>
        </div>
      </div>
    </section>
  );
}

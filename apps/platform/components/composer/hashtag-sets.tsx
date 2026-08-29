"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@wizeworks/silicaui-react";
import { listHashtagSets, noteHashtagSetUsed, type HashtagSetRow } from "@/lib/actions/hashtag-sets";
import { hashtagLimits, insertTags, limitWarning, renderTags, type HashtagChannel } from "@/lib/hashtags";
import { workspacePath } from "@/lib/nav";

type Target = "text" | "firstComment";

type Props = {
  workspaceId: string;
  /** Channels currently selected — their own `hashtagsMax` is the only ceiling that counts. */
  channels: HashtagChannel[];
  text: string;
  firstComment: string;
  firstCommentAvailable: boolean;
  onInsert: (target: Target, next: string) => void;
};

/** "Insert hashtag set" — appends a saved set to the shared text or the first comment. */
export function HashtagSets({ workspaceId, channels, text, firstComment, firstCommentAvailable, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState<HashtagSetRow[] | null>(null);
  const [target, setTarget] = useState<Target>("text");
  const [error, setError] = useState<string | null>(null);

  const change = (o: boolean) => {
    setOpen(o);
    if (!o || sets) return;
    listHashtagSets(workspaceId).then(setSets).catch(() => setError("Could not load hashtag sets."));
  };

  const current = target === "text" ? text : firstComment;
  const apply = (s: HashtagSetRow) => {
    const next = insertTags(current, s.tags);
    onInsert(target, next);
    void noteHashtagSetUsed(workspaceId, s.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger>
        <Button size="xs" variant="ghost" color="neutral" aria-label="Insert hashtag set"># Sets</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-100 p-3">
        <PopoverTitle className="text-sm font-semibold">Insert a hashtag set</PopoverTitle>
        {firstCommentAvailable && <TargetPicker target={target} setTarget={setTarget} />}
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        {!error && sets === null && <p className="mt-2 text-sm text-secondary">Loading…</p>}
        {sets?.length === 0 && (
          <p className="mt-2 text-sm text-secondary/70">
            No sets yet. Create one in <Link href={workspacePath(workspaceId, "settings/hashtags")} className="font-medium underline underline-offset-2">Settings → Hashtag sets</Link>.
          </p>
        )}
        {sets && sets.length > 0 && (
          <ul className="mt-2 flex max-h-80 flex-col divide-y divide-base-300 overflow-y-auto">
            {sets.map((s) => (<SetRow key={s.id} set={s} channels={channels} current={current} onUse={() => apply(s)} />))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TargetPicker({ target, setTarget }: { target: Target; setTarget: (t: Target) => void }) {
  const cls = (on: boolean) => `rounded-field px-2 py-1 text-xs ${on ? "bg-base-200 font-semibold" : "text-secondary"}`;
  return (
    <div className="mt-2 flex gap-1" role="group" aria-label="Insert into">
      <button type="button" className={cls(target === "text")} aria-pressed={target === "text"} onClick={() => setTarget("text")}>Post text</button>
      <button type="button" className={cls(target === "firstComment")} aria-pressed={target === "firstComment"} onClick={() => setTarget("firstComment")}>First comment</button>
    </div>
  );
}

function SetRow({ set, channels, current, onUse }: { set: HashtagSetRow; channels: HashtagChannel[]; current: string; onUse: () => void }) {
  const preview = insertTags(current, set.tags);
  const warning = limitWarning(hashtagLimits(channels, preview));
  return (
    <li className="flex items-start gap-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{set.name}</span>
        <span className="block truncate text-xs text-secondary/70">{renderTags(set.tags)}</span>
        {warning && <span className="mt-1 block text-xs text-warning">⚠ {warning}</span>}
      </span>
      <Button size="xs" variant="outline" color="neutral" onClick={onUse}>Insert</Button>
    </li>
  );
}

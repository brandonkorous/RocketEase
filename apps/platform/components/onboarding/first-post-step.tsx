"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Textarea } from "@wizeworks/silicaui-react";
import { SendIcon } from "@rocketease/ui/icons";
import { createDraft, saveDraft } from "@/lib/actions/content";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";
import { StepIntro } from "./frame";

type Channel = { id: string; name: string; network: string };

/** Step 5: a short first draft that opens in Create for media, per-channel tweaks, and scheduling. */
export function FirstPostStep({ workspaceId, channels, doneHref }: { workspaceId: string; channels: Channel[]; doneHref: string }) {
  const { toast, router } = useActionFeedback();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string[]>(channels.map((c) => c.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const start = async () => {
    setPending(true);
    const created = await createDraft(workspaceId);
    if ("error" in created && created.error) { toast.add({ title: created.error, type: "error" }); setPending(false); return; }
    const itemId = (created as { itemId: string }).itemId;
    const saved = await saveDraft({ workspaceId, itemId, sharedText: text, channelIds: selected });
    if (saved && "error" in saved && saved.error) { toast.add({ title: saved.error, type: "error" }); setPending(false); return; }
    router.push(`${workspacePath(workspaceId, "create")}?item=${itemId}&onboarding=1`);
  };

  return (
    <div>
      <StepIntro icon={<SendIcon size={22} />} title="Let's create your first post" copy="Kick things off by drafting a post for your audience." />
      <div className="rounded-box border border-base-300 p-3">
        <div className="flex items-center gap-1.5" aria-label="Channels">
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={selected.includes(c.id)} title={c.name} className={`rounded-full p-0.5 ${selected.includes(c.id) ? "ring-2 ring-primary ring-offset-1" : "opacity-40"}`}><NetMark network={c.network} size={18} /></button>
          ))}
          {channels.length === 0 && <span className="text-xs text-secondary">No channels connected yet — you can still draft.</span>}
        </div>
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Small daily choices. Big long-term results…" className="mt-3 w-full text-sm" aria-label="Post text" />
        <div className="mt-2 flex items-center justify-between text-xs text-secondary/70"><span>Add media, hashtags, and per-channel edits in Create.</span><span>{text.length} / 2,200</span></div>
      </div>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button color="primary" size="lg" block loading={pending} disabled={!text.trim()} onClick={start}>Continue in Create</Button>
        <Link href={doneHref} className="text-sm text-secondary hover:underline">Skip for now</Link>
      </div>
    </div>
  );
}

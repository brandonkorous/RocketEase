"use client";

import { Switch } from "@wizeworks/silicaui-react";
import { updateBioPage } from "@/lib/actions/bio/page";
import type { EditorData } from "@/lib/bio/queries";
import { NETWORK_LABEL } from "@/components/composer/types";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { Card, Hint, Label } from "./card";

/** The latest-posts strip: on/off and which connected channel feeds it. */
export function PostsCard({ data }: { data: EditorData }) {
  const page = data.page!;
  const { run, pending } = useActionFeedback();
  const d = !data.canEdit || pending;
  const save = (patch: { showPosts?: boolean; postsChannelId?: string | null }) => run(() => updateBioPage({ workspaceId: data.workspaceId, ...patch }));
  const channelLabel = (c: EditorData["channels"][number]) => `${NETWORK_LABEL[c.network] ?? c.network} · ${c.handle ?? c.name}`;
  return (
    <Card title="Latest posts">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm leading-normal">Show the last {data.limits.posts} published posts as tiles. Each tile opens the post on its network.</span>
        <Switch checked={page.showPosts} disabled={d} onCheckedChange={(v: boolean) => save({ showPosts: v })} aria-label="Show latest posts" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="bio-channel">From</Label>
        {data.channels.length === 0 ? (
          <Hint>No connected channel yet. Connect one under Connected accounts, then pick it here.</Hint>
        ) : (
          <select id="bio-channel" className="select select-sm w-full max-w-80" value={page.postsChannelId ?? ""} disabled={d || !page.showPosts} onChange={(e) => save({ postsChannelId: e.target.value || null })}>
            <option value="">Choose a channel…</option>
            {data.channels.map((c) => (<option key={c.id} value={c.id}>{channelLabel(c)}</option>))}
          </select>
        )}
        <Hint>One connected channel. Posts with no picture are skipped; nothing is pulled from the network beyond what RocketEase already published.{page.showPosts && page.postsChannelId && data.preview && data.preview.posts.length === 0 ? " No published posts with a picture yet, so the strip is not shown." : ""}</Hint>
      </div>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Input, Textarea } from "@wizeworks/silicaui-react";
import { updateBioPage } from "@/lib/actions/bio/page";
import type { AvatarSource } from "@/db/schema/bio";
import type { EditorData } from "@/lib/bio/queries";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { Card, Hint, Label } from "./card";

/** Avatar, name and bio. Text saves when you leave the field; the kit is never changed from here. */
export function HeaderCard({ data }: { data: EditorData }) {
  const page = data.page!;
  const { run, pending } = useActionFeedback();
  const [name, setName] = useState(page.name);
  const [bio, setBio] = useState(page.bio);
  const d = !data.canEdit || pending;
  const save = (patch: { name?: string; bio?: string }) => run(() => updateBioPage({ workspaceId: data.workspaceId, ...patch }));
  const showLogo = page.avatar === "logo" && data.avatarUrl;
  return (
    <Card title="Header">
      <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-1.5">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatarUrl!} alt="" className="h-18 w-18 rounded-full border border-base-300 object-cover" />
          ) : (
            <span className="flex h-18 w-18 items-center justify-center rounded-full bg-base-content text-2xl font-bold text-base-100" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "•"}</span>
          )}
          <select className="select select-xs w-full" value={page.avatar} disabled={d} aria-label="Avatar" onChange={(e) => run(() => updateBioPage({ workspaceId: data.workspaceId, avatar: e.target.value as AvatarSource }))}>
            <option value="logo">{data.avatarUrl ? "Brand logo" : "Brand logo (none uploaded)"}</option>
            <option value="none">Initial</option>
          </select>
          {!data.avatarUrl && <Hint>Add a favicon or mark under Visual identity › Logos to use it here.</Hint>}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="bio-name">Name</Label>
            <Input id="bio-name" size="sm" value={name} maxLength={data.limits.name} disabled={d} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== page.name) save({ name }); }} />
            <Hint>Starts from Brand › Identity › display name. Change it here without changing the kit.</Hint>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="bio-bio">Bio</Label>
            <Textarea id="bio-bio" rows={3} value={bio} maxLength={data.limits.bio} disabled={d} className="w-full text-sm" onChange={(e) => setBio(e.target.value)} onBlur={() => { if (bio !== page.bio) save({ bio }); }} />
            <Hint>{bio.length} / {data.limits.bio} characters, like a network bio.</Hint>
          </div>
        </div>
      </div>
    </Card>
  );
}

"use client";

import type { EditorData } from "@/lib/bio/queries";
import { BioEmpty } from "./empty";
import { HeaderCard } from "./header-card";
import { LinksCard } from "./links-card";
import { LookCard } from "./look-card";
import { PostsCard } from "./posts-card";
import { BioPreview } from "./preview";
import { StatusCard } from "./status-card";

/** Brand › Link in bio (images/link-in-bio.png): status, header, links, latest posts, look — and the phone beside them. */
export function BioEditor({ data, host }: { data: EditorData; host: string }) {
  if (!data.page || !data.preview) return <BioEmpty workspaceId={data.workspaceId} canEdit={data.canEdit} kitName={data.kitName} host={host} />;
  return (
    <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <StatusCard workspaceId={data.workspaceId} address={data.page.address} live={data.page.live} canEdit={data.canEdit} />
        <HeaderCard data={data} />
        <LinksCard data={data} />
        <PostsCard data={data} />
        <LookCard data={data} />
      </div>
      <BioPreview page={data.preview} />
    </div>
  );
}

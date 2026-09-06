"use client";

import { Button } from "@wizeworks/silicaui-react";
import { createBioPage } from "@/lib/actions/bio/page";
import { slugFrom } from "@/lib/bio/rules";
import { useActionFeedback } from "@/lib/use-action-feedback";

/** First visit (images/link-in-bio-empty.png): what the page is, where it will live, one button. */
export function BioEmpty({ workspaceId, canEdit, kitName, host }: { workspaceId: string; canEdit: boolean; kitName: string; host: string }) {
  const { run, pending } = useActionFeedback();
  return (
    <div className="mt-4 flex flex-col items-center rounded-box border border-base-300 px-8 py-14 text-center">
      <div className="h-21 w-30 rounded-lg border border-dashed border-base-300" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold">No link-in-bio page yet</h3>
      <p className="mt-1.5 max-w-115 text-sm leading-normal text-secondary">
        One page for every bio, at an address like <strong className="text-base-content">{host}/l/{slugFrom(kitName)}</strong>. It starts from your brand kit: the avatar, the name and a bio. Add the links you want people to reach, and switch on a strip of your latest posts.
      </p>
      {canEdit ? (
        <Button className="mt-4" color="primary" loading={pending} onClick={() => run(() => createBioPage(workspaceId))}>Create your page</Button>
      ) : (
        <p className="mt-4 text-sm text-secondary">An owner, admin or manager creates it.</p>
      )}
      <p className="mt-3 text-xs text-secondary/70">The page stays private until you switch it to Live.</p>
    </div>
  );
}

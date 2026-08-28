"use server";

import { enqueueInsightsIngests } from "@/lib/analytics/schedule";
import { requireWorkspace } from "@/lib/session";
import { guard, type ActionState } from "./content/shared";

/** Ask the worker to re-pull insights for this workspace's channels now. */
export async function refreshInsightsNow(workspaceId: string): Promise<ActionState> {
  return guard(async () => {
    await requireWorkspace(workspaceId);
    const n = await enqueueInsightsIngests(workspaceId);
    return { ok: n ? `Refreshing ${n} channel${n > 1 ? "s" : ""}. Numbers update in a few seconds.` : "No channels can provide insights yet." };
  });
}

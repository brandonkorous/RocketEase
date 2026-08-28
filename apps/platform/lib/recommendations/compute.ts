/*
 * One computation pass for a workspace: gather facts, run every rule, store the
 * drafts, and rewrite the best-time slots. Called by the nightly
 * `recommendations.compute` job and by the on-demand recompute action.
 */
import { saveSlots } from "./best-times";
import { computeSlots } from "./slots";
import { collectFacts } from "./facts";
import { runRules } from "./rules";
import { persistDrafts } from "./store";

export type ComputeResult = { workspaceId: string; recommendations: number; slots: number; channels: number; posts: number };

export async function computeForWorkspace(workspaceId: string): Promise<ComputeResult | null> {
  const facts = await collectFacts(workspaceId);
  if (!facts) return null;
  const drafts = runRules(facts);
  await persistDrafts(facts.organizationId, workspaceId, drafts);
  let slots = 0;
  for (const c of facts.channels) {
    const computed = computeSlots(c);
    await saveSlots(facts.organizationId, workspaceId, c.channelId, computed);
    slots += computed.length;
  }
  return { workspaceId, recommendations: drafts.length, slots, channels: facts.channels.length, posts: facts.channels.reduce((n, c) => n + c.posts.length, 0) };
}

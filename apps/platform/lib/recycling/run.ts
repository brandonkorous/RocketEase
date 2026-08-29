/*
 * One occurrence of one recycle rule.
 *
 * The human gate is the default: a run creates a DRAFT. It only schedules when
 * the workspace turned `settings.recycling.autoSchedule` on AND the rule's
 * author still holds `content.publish` AND every variant validates clean.
 *
 * Idempotency: the `recycle_run` row is written FIRST inside the transaction,
 * so the unique (rule, occurrence) index claims the slot before any content
 * exists. A redelivered tick loses the race and does nothing.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import { contentItem, postVariant } from "@/db/schema/content";
import { recycleRule, recycleRun, type RecycleRule } from "@/db/schema/recycling";
import { audit } from "@/lib/audit";
import { can } from "@/lib/authz";
import { summarizeItem, validateVariant } from "@/lib/content";
import { log } from "@/lib/log";
import { candidatesForRule } from "./candidates";
import { occurrenceKey, selectForOccurrence, type Candidate } from "./eligibility";
import { scheduleRecycled } from "./schedule";

export type RunResult = { outcome: "created" | "scheduled" | "skipped"; reason: string | null; newItemId?: string };

/** The rule acts as its author; a demoted author silently loses auto-scheduling, not the draft. */
async function authorCan(rule: RecycleRule, cap: "content.create" | "content.publish"): Promise<boolean> {
  if (!rule.createdByUserId) return cap === "content.create";
  const [m] = await db.select({ role: workspaceMembership.role, grants: workspaceMembership.grants, off: workspaceMembership.deactivatedAt }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, rule.workspaceId), eq(workspaceMembership.userId, rule.createdByUserId)));
  if (!m || m.off) return false;
  return can({ role: m.role, grants: m.grants }, cap, { policyAllows: true });
}

async function logSkip(rule: RecycleRule, occurrence: string, reason: string): Promise<RunResult> {
  await db
    .insert(recycleRun)
    .values({ organizationId: rule.organizationId, workspaceId: rule.workspaceId, ruleId: rule.id, occurrence, occurrenceKey: occurrenceKey(rule.id, "", occurrence), outcome: "skipped", reason })
    .onConflictDoNothing();
  return { outcome: "skipped", reason };
}

/** Channels for the copy: the rule's list when it has one, else whatever the source published to. */
const destinationsFor = (rule: RecycleRule, source: Candidate) => (rule.channelIds.length ? rule.channelIds.filter((c) => source.channelIds.includes(c)) : source.channelIds);

async function cloneItem(rule: RecycleRule, source: Candidate, occurrence: string, channelIds: string[]) {
  const item = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, source.itemId) });
  if (!item) return null;
  return db.transaction(async (tx) => {
    // Claims the slot before any content exists; a duplicate tick throws here and is caught by the caller.
    const [run] = await tx
      .insert(recycleRun)
      .values({ organizationId: rule.organizationId, workspaceId: rule.workspaceId, ruleId: rule.id, occurrence, occurrenceKey: occurrenceKey(rule.id, source.itemId, occurrence), sourceItemId: source.itemId, outcome: "created" })
      .returning({ id: recycleRun.id });
    const [copy] = await tx
      .insert(contentItem)
      .values({ organizationId: rule.organizationId, workspaceId: rule.workspaceId, title: item.title, sharedText: item.sharedText, sharedAssetIds: item.sharedAssetIds, link: item.link, tagIds: item.tagIds, recycledFromItemId: item.id, ownerUserId: item.ownerUserId, createdByUserId: rule.createdByUserId })
      .returning({ id: contentItem.id });
    const originals = await tx.select().from(postVariant).where(and(eq(postVariant.contentItemId, item.id), inArray(postVariant.channelId, channelIds)));
    for (const v of originals)
      await tx.insert(postVariant).values({ organizationId: rule.organizationId, workspaceId: rule.workspaceId, contentItemId: copy.id, channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings });
    await tx.update(recycleRun).set({ newItemId: copy.id }).where(eq(recycleRun.id, run.id));
    await tx.update(recycleRule).set({ lastRunAt: new Date(), runCount: rule.runCount + 1, updatedAt: new Date() }).where(eq(recycleRule.id, rule.id));
    return { runId: run.id, newItemId: copy.id };
  });
}

/** Run one rule for one slot. Safe to call again for the same slot. */
export async function runOccurrence(rule: RecycleRule, occurrence: string, opts: { autoSchedule: boolean; scheduleAt: Date; now: Date }): Promise<RunResult> {
  if (!(await authorCan(rule, "content.create"))) return logSkip(rule, occurrence, "The person who created this rule can no longer create content.");
  const candidates = await candidatesForRule(rule.workspaceId, rule.id);
  const { picked, ruleReason, rejected } = selectForOccurrence({ ...rule, pauseUntil: rule.pauseUntil }, candidates, opts.now);
  if (!picked) return logSkip(rule, occurrence, ruleReason ?? "Nothing is due for reuse yet.");
  const channelIds = destinationsFor(rule, picked);
  if (channelIds.length === 0) return logSkip(rule, occurrence, "No destination the source actually published to.");

  let cloned: Awaited<ReturnType<typeof cloneItem>>;
  try {
    cloned = await cloneItem(rule, picked, occurrence, channelIds);
  } catch (err) {
    log.info("recycle: slot already taken", { ruleId: rule.id, occurrence, err });
    return { outcome: "skipped", reason: "This slot already ran." };
  }
  if (!cloned) return logSkip(rule, occurrence, "The source post disappeared.");

  const copy = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, cloned.newItemId) });
  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, cloned.newItemId));
  const issues = copy ? (await Promise.all(variants.map((v) => validateVariant(copy, v)))).flatMap((v) => v.issues) : [];
  await summarizeItem(cloned.newItemId);
  const blocking = issues.find((i) => i.severity === "error");

  const base = { organizationId: rule.organizationId, workspaceId: rule.workspaceId, targetType: "content_item", targetId: cloned.newItemId };
  const auditRun = (note: string) => audit({ action: "content.recycle", actorUserId: rule.createdByUserId, ...base, summary: { note, after: { ruleId: rule.id, occurrence, sourceItemId: picked.itemId, considered: candidates.length, rejected: rejected.length } } });

  if (!opts.autoSchedule || blocking || !(await authorCan(rule, "content.publish"))) {
    const reason = blocking ? blocking.message : opts.autoSchedule ? "Auto-scheduling is off for this rule's author." : "Waiting for a person to schedule it.";
    await db.update(recycleRun).set({ reason }).where(eq(recycleRun.id, cloned.runId));
    await auditRun(`draft from ${picked.itemId}`);
    return { outcome: "created", reason, newItemId: cloned.newItemId };
  }
  await scheduleRecycled(cloned.newItemId, opts.scheduleAt, rule.createdByUserId);
  await db.update(recycleRun).set({ outcome: "scheduled", scheduledFor: opts.scheduleAt }).where(eq(recycleRun.id, cloned.runId));
  await auditRun(`scheduled from ${picked.itemId}`);
  return { outcome: "scheduled", reason: null, newItemId: cloned.newItemId };
}

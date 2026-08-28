/*
 * Recent real subjects for a trigger, used by "Test against the last 50 items"
 * in the builder. Read-only: the dry run never writes a run or an action.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import type { TriggerKind } from "@/db/schema/automations";
import { approvalRequest } from "@/db/schema/approvals";
import { adAccount } from "@/db/schema/campaigns";
import { contentItem, postVariant } from "@/db/schema/content";
import { conversation, message } from "@/db/schema/engagement";
import { resolveSubjects, type Subject } from "./facts";

const LIMIT = 50;

async function recentIds(trigger: TriggerKind, workspaceId: string): Promise<string[]> {
  switch (trigger) {
    case "inbox.message_received": {
      const rows = await db
        .select({ id: message.id })
        .from(message)
        .innerJoin(conversation, eq(conversation.id, message.conversationId))
        .where(and(eq(message.workspaceId, workspaceId), eq(message.direction, "inbound")))
        .orderBy(desc(message.occurredAt))
        .limit(LIMIT);
      return rows.map((r) => r.id);
    }
    case "post.published":
    case "post.failed": {
      const rows = await db
        .select({ id: postVariant.id })
        .from(postVariant)
        .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
        .where(and(eq(postVariant.workspaceId, workspaceId), eq(postVariant.status, trigger === "post.failed" ? "failed" : "published")))
        .orderBy(desc(postVariant.updatedAt))
        .limit(LIMIT);
      return rows.map((r) => r.id);
    }
    case "approval.decided": {
      const rows = await db
        .select({ id: approvalRequest.id })
        .from(approvalRequest)
        .where(and(eq(approvalRequest.workspaceId, workspaceId), inArray(approvalRequest.state, ["approved", "changes_requested", "rejected"])))
        .orderBy(desc(approvalRequest.decidedAt))
        .limit(LIMIT);
      return rows.map((r) => r.id);
    }
    case "campaign.budget_threshold": {
      const rows = await db.select({ id: adAccount.id }).from(adAccount).where(and(eq(adAccount.workspaceId, workspaceId))).limit(LIMIT);
      return rows.map((r) => r.id);
    }
    default:
      return [];
  }
}

/** Up to 50 recent subjects for this trigger in this workspace. */
export async function recentSubjects(trigger: TriggerKind, workspaceId: string): Promise<Subject[]> {
  const ids = await recentIds(trigger, workspaceId);
  const out: Subject[] = [];
  for (const id of ids) {
    for (const s of await resolveSubjects(trigger, id)) {
      if (s.workspaceId === workspaceId) out.push(s);
      if (out.length >= LIMIT) return out;
    }
  }
  return out;
}

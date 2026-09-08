/*
 * The decision with the database plugged in: the counts a cap or the
 * one-automated-message rule needs are read only when the network has a cap
 * or a rule is sending. Kept apart from window.ts so the pure decision can be
 * tested without a database. Worker-safe.
 */
import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { MESSAGING_RULES } from "@rocketease/providers";
import { db } from "@/db";
import type { Channel } from "@/db/schema/connections";
import { conversation, message, type Conversation } from "@/db/schema/engagement";
import { networkLabel } from "@/lib/publishing/receipt-copy";
import { sendDecision, type SendDecision } from "./window";

/** Outbound rows that count against a cap: sent, or on their way. A draft or a failure never counts. */
const LIVE = ["queued", "sending", "sent", "ambiguous"] as const;
const NONE = { per15min: 0, per24h: 0 };

export type DecisionConversation = Pick<Conversation, "id" | "kind" | "channelId" | "contactId" | "lastInboundAt">;
export type DecisionOptions = { automated: boolean; excludeMessageId?: string; now?: Date };

/** Direct messages this channel sent or queued in the last 15 minutes and 24 hours. */
async function recentSends(channelId: string, now: Date, exclude?: string) {
  const since = (ms: number) => new Date(now.getTime() - ms);
  const [row] = await db
    .select({
      per15min: sql<number>`count(*) filter (where ${message.occurredAt} > ${since(15 * 60_000).toISOString()}::timestamptz)::int`,
      per24h: sql<number>`count(*) filter (where ${message.occurredAt} > ${since(86_400_000).toISOString()}::timestamptz)::int`,
    })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(and(eq(message.channelId, channelId), eq(message.direction, "outbound"), eq(conversation.kind, "message"), inArray(message.deliveryState, [...LIVE]), gt(message.occurredAt, since(86_400_000)), exclude ? ne(message.id, exclude) : undefined));
  return row ?? NONE;
}

/** Automated (rule-written) direct messages this contact got from this channel in the last 24 hours. */
async function automatedSends(channelId: string, contactId: string, now: Date, exclude?: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(and(eq(message.channelId, channelId), eq(conversation.contactId, contactId), eq(conversation.kind, "message"), eq(message.direction, "outbound"), isNotNull(message.ruleId), inArray(message.deliveryState, [...LIVE]), gt(message.occurredAt, new Date(now.getTime() - 86_400_000)), exclude ? ne(message.id, exclude) : undefined));
  return row?.n ?? 0;
}

/** Can a reply in this thread go out now, here? */
export async function replyDecision(conv: DecisionConversation, ch: Pick<Channel, "network">, opts: DecisionOptions): Promise<SendDecision> {
  const now = opts.now ?? new Date();
  const rules = MESSAGING_RULES[ch.network];
  const dm = conv.kind === "message" && rules.dm;
  const recent = dm && rules.caps ? await recentSends(conv.channelId, now, opts.excludeMessageId) : NONE;
  const automatedToContact = dm && opts.automated ? await automatedSends(conv.channelId, conv.contactId, now, opts.excludeMessageId) : 0;
  return sendDecision({ network: ch.network, networkLabel: networkLabel(ch.network), kind: conv.kind, now, lastInboundAt: conv.lastInboundAt, automated: opts.automated, recent, automatedToContact });
}

"use server";

import { randomUUID } from "node:crypto";
import type { InboxItem, InboxItemKind, WebhookEvent } from "@make-it-social/providers";
import { db } from "@/db";
import { webhookReceipt } from "@/db/schema/connections";
import { enqueue } from "@/lib/jobs/boss";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const PEOPLE = [
  { remoteId: "u-sarah", name: "Sarah Patterson", handle: "@sarah.fitjourney" },
  { remoteId: "u-mike", name: "Mike Chen", handle: "@mike.chen" },
  { remoteId: "u-amanda", name: "Amanda Hopkins", handle: "@amandah" },
];

/**
 * Dev-only: push a fake inbound item through the real webhook → worker path
 * for a mock channel. Lets the whole inbox loop be exercised locally.
 */
export async function simulateInbound(workspaceId: string, channelId: string, input: { text: string; kind?: InboxItemKind; threadRemoteId?: string; who?: number; rating?: number }): Promise<ActionState> {
  return guard(async () => {
    if (process.env.NODE_ENV === "production") return fail("Not available in production.");
    await requireCapability(workspaceId, "conversations.handle");
    const ch = await db.query.channel.findFirst({ where: (c, { and, eq }) => and(eq(c.id, channelId), eq(c.workspaceId, workspaceId)) });
    if (!ch || ch.provider !== "mock") return fail("Pick a demo-network channel.");
    const who = PEOPLE[(input.who ?? Math.floor(Math.random() * PEOPLE.length)) % PEOPLE.length];
    const thread = input.threadRemoteId ?? `${ch.remoteId}-t${Date.now().toString(36)}`;
    const item: InboxItem = { remoteId: `${thread}-m${randomUUID().slice(0, 8)}`, threadRemoteId: thread, kind: input.kind ?? "message", direction: "inbound", author: who, text: input.text.trim() || (input.kind === "review" ? "" : "Hi! Quick question about your latest post."), occurredAt: new Date().toISOString(), rating: input.rating };
    const event: WebhookEvent = { eventId: `sim-${item.remoteId}`, channelRemoteId: ch.remoteId, kind: "inbox.item", occurredAt: item.occurredAt, payload: item };
    const [row] = await db.insert(webhookReceipt).values({ provider: "mock", eventId: event.eventId, channelRemoteId: ch.remoteId, payload: event }).returning({ id: webhookReceipt.id });
    await enqueue("webhook.process", { receiptId: row.id });
    return { ok: "Incoming message simulated — it will appear in a few seconds." };
  });
}

/** Dev-only: ask the worker to poll the channel now. */
export async function syncInboxNow(workspaceId: string): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "conversations.handle");
    const channels = await db.query.channel.findMany({ where: (c, { and, eq, inArray }) => and(eq(c.workspaceId, workspaceId), inArray(c.status, ["healthy", "degraded"])) });
    for (const ch of channels) await enqueue("inbox.sync", { channelId: ch.id, reason: "manual" }, { singletonKey: `inbox.sync:${ch.id}` });
    return { ok: channels.length ? "Sync requested." : "No connected channels to sync." };
  });
}

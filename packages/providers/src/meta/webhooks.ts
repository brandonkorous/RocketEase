/*
 * Meta webhooks: signature verification, envelope parsing, and mapping of
 * inbox-relevant events onto InboxItem. Thread ids match fetchInbox:
 * DMs → the customer's PSID/IGSID, comments → root comment id.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboxItem } from "../inbox-types";
import type { ProviderConfig, WebhookEvent } from "../types";

type From = { id: string; name?: string; username?: string };
type Feed = { item?: string; verb?: string; comment_id?: string; post_id?: string; parent_id?: string; message?: string; from?: From; created_time?: number; sender_id?: string; sender_name?: string };
type Messaging = { sender?: { id: string }; recipient?: { id: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[] } };
type IgComment = { id?: string; text?: string; from?: From; media?: { id?: string }; parent_id?: string };
type IgMention = { media_id?: string; comment_id?: string };

const secs = (t: number | undefined, fallback: string) => (t ? new Date(t > 1e12 ? t : t * 1000).toISOString() : fallback);
const person = (f: From | undefined, fallback: string) => ({ remoteId: f?.id ?? fallback, name: f?.name ?? f?.username ?? "Unknown", handle: f?.username ? `@${f.username}` : undefined });

export function verifyMetaWebhook(cfg: ProviderConfig, req: { headers: Record<string, string>; rawBody: string; query?: Record<string, string> }): boolean {
  if (req.query?.["hub.mode"] === "subscribe") return Boolean(cfg.extra?.webhookVerifyToken) && req.query["hub.verify_token"] === cfg.extra?.webhookVerifyToken;
  const sig = req.headers["x-hub-signature-256"] ?? req.headers["X-Hub-Signature-256"];
  if (!sig) return false;
  const expected = `sha256=${createHmac("sha256", cfg.clientSecret).update(req.rawBody).digest("hex")}`;
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseMetaWebhook(rawBody: string): WebhookEvent[] {
  const body = JSON.parse(rawBody) as { object?: string; entry?: { id: string; time: number; changes?: { field: string; value: unknown }[]; messaging?: unknown[] }[] };
  const out: WebhookEvent[] = [];
  for (const entry of body.entry ?? []) {
    const at = new Date(entry.time * 1000).toISOString();
    for (const [i, ch] of (entry.changes ?? []).entries()) out.push({ eventId: `${entry.id}:${entry.time}:${i}:${ch.field}`, channelRemoteId: entry.id, kind: `${body.object}.${ch.field}`, occurredAt: at, payload: ch.value });
    for (const [i, m] of (entry.messaging ?? []).entries()) {
      const mid = (m as Messaging).message?.mid;
      out.push({ eventId: mid ? `${entry.id}:msg:${mid}` : `${entry.id}:${entry.time}:m${i}`, channelRemoteId: entry.id, kind: `${body.object}.messaging`, occurredAt: at, payload: m });
    }
  }
  return out;
}

function feedItems(e: WebhookEvent): InboxItem[] | null {
  const v = e.payload as Feed | undefined;
  if (v?.verb !== "add" || !v.from) return null;
  const at = secs(v.created_time, e.occurredAt);
  const post = v.post_id;
  if (v.item === "comment" && v.comment_id) {
    const root = v.parent_id && v.parent_id !== post ? v.parent_id : v.comment_id;
    return [{ remoteId: v.comment_id, threadRemoteId: root, kind: "comment", direction: v.from.id === e.channelRemoteId ? "outbound" : "inbound", author: person(v.from, v.comment_id), text: v.message ?? "", occurredAt: at, inReplyToRemoteId: v.parent_id !== post ? v.parent_id : undefined, postRemoteId: post }];
  }
  // A visitor posting on the Page's timeline is a mention of the Page.
  if (post && ["post", "status", "photo", "video", "share"].includes(v.item ?? "") && v.from.id !== e.channelRemoteId) {
    return [{ remoteId: post, threadRemoteId: post, kind: "mention", direction: "inbound", author: person(v.from, post), text: v.message ?? "", occurredAt: at, postRemoteId: post }];
  }
  return null;
}

function pageMention(e: WebhookEvent): InboxItem[] | null {
  const v = e.payload as Feed | undefined;
  if (!v?.post_id || v.verb === "remove") return null;
  const id = v.comment_id ?? v.post_id;
  return [{ remoteId: `mention:${id}`, threadRemoteId: v.comment_id ?? v.post_id, kind: "mention", direction: "inbound", author: { remoteId: v.sender_id ?? id, name: v.sender_name ?? "Unknown" }, text: v.message ?? "", occurredAt: e.occurredAt, postRemoteId: v.post_id }];
}

function messagingItems(e: WebhookEvent): InboxItem[] | null {
  const m = e.payload as Messaging | undefined;
  const msg = m?.message;
  if (!msg?.mid || !m?.sender?.id) return null;
  const echo = msg.is_echo === true || m.sender.id === e.channelRemoteId;
  const customer = echo ? m.recipient?.id : m.sender.id;
  if (!customer) return null;
  const attachments = (msg.attachments ?? []).flatMap((a) => (a.payload?.url ? [{ url: a.payload.url, mimeType: a.type === "image" ? "image/*" : a.type === "video" ? "video/*" : a.type === "audio" ? "audio/*" : "application/octet-stream" }] : []));
  return [{ remoteId: msg.mid, threadRemoteId: customer, kind: "message", direction: echo ? "outbound" : "inbound", author: echo ? { remoteId: e.channelRemoteId ?? m.sender.id, name: "Page" } : { remoteId: customer, name: "Unknown" }, text: msg.text ?? "", attachments: attachments.length ? attachments : undefined, occurredAt: secs(m.timestamp, e.occurredAt) }];
}

function igComment(e: WebhookEvent): InboxItem[] | null {
  const v = e.payload as IgComment | undefined;
  if (!v?.id) return null;
  const mine = v.from?.id === e.channelRemoteId;
  return [{ remoteId: v.id, threadRemoteId: v.parent_id ?? v.id, kind: "comment", direction: mine ? "outbound" : "inbound", author: person(v.from, v.id), text: v.text ?? "", occurredAt: e.occurredAt, inReplyToRemoteId: v.parent_id, postRemoteId: v.media?.id }];
}

function igMention(e: WebhookEvent): InboxItem[] | null {
  const v = e.payload as IgMention | undefined;
  if (!v?.media_id) return null;
  const id = v.comment_id ?? v.media_id;
  return [{ remoteId: `mention:${id}`, threadRemoteId: id, kind: "mention", direction: "inbound", author: { remoteId: id, name: "Instagram user" }, text: "", occurredAt: e.occurredAt, postRemoteId: v.media_id }];
}

const HANDLERS: Record<string, (e: WebhookEvent) => InboxItem[] | null> = {
  "page.feed": feedItems,
  "page.mention": pageMention,
  "page.messaging": messagingItems,
  "instagram.messaging": messagingItems,
  "instagram.comments": igComment,
  "instagram.mentions": igMention,
};

export const metaInboxItemsFromWebhook = (e: WebhookEvent): InboxItem[] | null => HANDLERS[e.kind]?.(e) ?? null;

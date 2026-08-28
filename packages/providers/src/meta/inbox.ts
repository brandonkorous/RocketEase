/*
 * Meta inbox: Page/Instagram conversations (Messenger + IG DMs via the Page)
 * and comments on recent posts. Everything maps onto InboxItem; threading:
 * DMs → conversation id, comments → root comment id.
 */
import type { InboxItem, InboxPage, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential, ProviderConfig } from "../types";
import { ProviderError } from "../types";
import { graph, now } from "./graph";

type Person = { id: string; name?: string; username?: string; email?: string; profile_pic?: string };
type Msg = { id: string; message?: string; created_time: string; from?: Person; attachments?: { data?: { name?: string; mime_type?: string; file_url?: string; image_data?: { url?: string } }[] } };
type Conv = { id: string; updated_time: string; participants?: { data?: Person[] }; messages?: { data?: Msg[] } };
type Comment = { id: string; message?: string; text?: string; created_time?: string; timestamp?: string; from?: Person; username?: string; parent?: { id: string }; permalink_url?: string };

const token = (cred: Credential, ch: ChannelDescriptor) => ch.channelToken ?? cred.accessToken;
const author = (p: Person | undefined, fallback: string) => ({ remoteId: p?.id ?? fallback, name: p?.name ?? p?.username ?? "Unknown", handle: p?.username ? `@${p.username}` : undefined, avatarUrl: p?.profile_pic });

function messagesToItems(ch: ChannelDescriptor, c: Conv, since?: string): InboxItem[] {
  const customer = c.participants?.data?.find((p) => p.id !== ch.remoteId);
  return (c.messages?.data ?? [])
    .filter((m) => !since || m.created_time > since)
    .map((m) => ({
      remoteId: m.id, threadRemoteId: c.id, kind: "message" as const, direction: m.from?.id === ch.remoteId ? ("outbound" as const) : ("inbound" as const),
      author: m.from?.id === ch.remoteId ? { remoteId: ch.remoteId, name: ch.name } : author(m.from ?? customer, c.id), text: m.message ?? "", occurredAt: m.created_time,
      attachments: (m.attachments?.data ?? []).flatMap((a) => (a.file_url || a.image_data?.url ? [{ url: a.file_url ?? a.image_data!.url!, mimeType: a.mime_type ?? "application/octet-stream", name: a.name }] : [])),
    }));
}

async function fetchConversations(cfg: ProviderConfig, t: string, ch: ChannelDescriptor, since?: string): Promise<InboxItem[]> {
  const platform = ch.kind === "instagram_business" ? "instagram" : "messenger";
  const pageId = ch.kind === "instagram_business" ? ch.remoteId : ch.remoteId; // IG DMs are read through the linked Page id set as remoteId by the caller
  const res = await graph<{ data?: Conv[] }>(`/${pageId}/conversations`, cfg, t, { params: { platform, fields: "id,updated_time,participants,messages.limit(20){id,message,created_time,from,attachments}", limit: "25" } });
  return (res.data ?? []).filter((c) => !since || c.updated_time > since).flatMap((c) => messagesToItems(ch, c, since));
}

async function fetchComments(cfg: ProviderConfig, t: string, ch: ChannelDescriptor, since?: string): Promise<InboxItem[]> {
  const ig = ch.kind === "instagram_business";
  const posts = await graph<{ data?: { id: string; permalink_url?: string; permalink?: string }[] }>(ig ? `/${ch.remoteId}/media` : `/${ch.remoteId}/posts`, cfg, t, { params: { fields: ig ? "id,permalink" : "id,permalink_url", limit: "10" } });
  const out: InboxItem[] = [];
  for (const p of posts.data ?? []) {
    const fields = ig ? "id,text,timestamp,username,from,replies{id,text,timestamp,username,from}" : "id,message,created_time,from,parent,comments{id,message,created_time,from,parent}";
    const res = await graph<{ data?: (Comment & { replies?: { data?: Comment[] }; comments?: { data?: Comment[] } })[] }>(`/${p.id}/comments`, cfg, t, { params: { fields, limit: "50", order: "reverse_chronological" } });
    for (const c of res.data ?? []) {
      const all = [c, ...(c.replies?.data ?? c.comments?.data ?? []).map((r) => ({ ...r, parent: { id: c.id } }))];
      for (const x of all) {
        const at = x.created_time ?? x.timestamp ?? now();
        if (since && at <= since) continue;
        const from = x.from ?? (x.username ? { id: x.username, username: x.username } : undefined);
        const mine = from?.id === ch.remoteId;
        out.push({ remoteId: x.id, threadRemoteId: c.id, kind: "comment", direction: mine ? "outbound" : "inbound", author: mine ? { remoteId: ch.remoteId, name: ch.name } : author(from, x.id), text: x.message ?? x.text ?? "", occurredAt: at, inReplyToRemoteId: x.parent?.id, postRemoteId: p.id, postUrl: p.permalink_url ?? p.permalink });
      }
    }
  }
  return out;
}

export async function fetchInbox(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, opts: { since?: string }): Promise<InboxPage> {
  const t = token(cred, ch);
  const caps = ch.capabilities.inbox;
  const [dms, comments] = await Promise.all([caps.messages ? fetchConversations(cfg, t, ch, opts.since).catch(() => []) : [], caps.comments ? fetchComments(cfg, t, ch, opts.since) : []]);
  return { items: [...dms, ...comments].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

export async function reply(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  const t = token(cred, ch);
  if (req.kind === "message") {
    if (!req.recipientRemoteId) throw new ProviderError("No recipient for this conversation.", { category: "validation" });
    const r = await graph<{ message_id?: string; recipient_id?: string }>(`/${ch.remoteId}/messages`, cfg, t, { method: "POST", params: { recipient: JSON.stringify({ id: req.recipientRemoteId }), messaging_type: "RESPONSE", message: JSON.stringify({ text: req.text, metadata: req.idempotencyKey }) } });
    if (!r.message_id) throw new ProviderError("Meta returned no message id", { category: "unknown", ambiguous: true });
    return { remoteId: r.message_id, sentAt: now() };
  }
  const target = req.inReplyToRemoteId ?? req.threadRemoteId;
  const edge = ch.kind === "instagram_business" ? `/${target}/replies` : `/${target}/comments`;
  const r = await graph<{ id?: string }>(edge, cfg, t, { method: "POST", params: { message: req.text } });
  if (!r.id) throw new ProviderError("Meta returned no comment id", { category: "unknown", ambiguous: true });
  return { remoteId: r.id, sentAt: now() };
}

/** Meta echoes DM metadata back; comments have no client reference, so scan the thread for our text marker. */
export async function findReply(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<ReplyResult | null> {
  const t = token(cred, ch);
  const res = await graph<{ data?: Conv[] }>(`/${ch.remoteId}/conversations`, cfg, t, { params: { fields: "id,messages.limit(10){id,created_time,from}", limit: "10" } }).catch(() => ({ data: [] as Conv[] }));
  for (const c of res.data ?? []) for (const m of c.messages?.data ?? []) if (m.from?.id === ch.remoteId && m.id.includes(idempotencyKey.slice(0, 8))) return { remoteId: m.id, sentAt: m.created_time };
  return null;
}

/*
 * Meta adapter: Facebook Pages + Instagram Business via the Graph API (v21).
 * Confirm scopes/limits during Meta app review (integrations.md "Compliance").
 */
import { createHmac } from "node:crypto";
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue, WebhookEvent } from "../types";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { validateAgainstCapabilities } from "../validate";
import { API, FB_CAPS, IG_CAPS, graph, mapGraphError, type GraphError } from "./graph";
import { findPublication, publicationStatus, publishToInstagram, publishToPage } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";

const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_metadata", "pages_read_user_content", "pages_manage_engagement", "pages_messaging", "instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_insights", "instagram_manage_messages", "business_management", "read_insights"];

type TokenRes = { access_token?: string; expires_in?: number } & GraphError;
type PageNode = { id: string; name: string; access_token: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string; name?: string } };

async function exchangeLongLived(cfg: ProviderConfig, shortToken: string) {
  const r = await httpJson<TokenRes>(`${API}/oauth/access_token?${form({ grant_type: "fb_exchange_token", client_id: cfg.clientId, client_secret: cfg.clientSecret, fb_exchange_token: shortToken })}`);
  if (r.status >= 400 || !r.body.access_token) throw mapGraphError(r.status, r.body);
  return { token: r.body.access_token, expiresAt: r.body.expires_in ? new Date(Date.now() + r.body.expires_in * 1000).toISOString() : undefined };
}

function pageToChannels(p: PageNode): ChannelDescriptor[] {
  const out: ChannelDescriptor[] = [{ remoteId: p.id, kind: "facebook_page", network: "facebook", name: p.name, avatarUrl: p.picture?.data?.url, channelToken: p.access_token, capabilities: FB_CAPS() }];
  const ig = p.instagram_business_account;
  if (ig) out.push({ remoteId: ig.id, kind: "instagram_business", network: "instagram", name: ig.name ?? ig.username ?? "Instagram", handle: ig.username ? `@${ig.username}` : undefined, avatarUrl: ig.profile_picture_url, channelToken: p.access_token, capabilities: IG_CAPS() });
  return out;
}

export function createMetaProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "meta",
    displayName: "Meta (Facebook & Instagram)",
    networks: ["facebook", "instagram"],
    accessSummary: ["See the Facebook Pages and Instagram business accounts you manage", "Publish posts, reels, and stories on the accounts you choose", "Read and reply to comments and messages", "Read post and audience insights", "Read ad account performance (never spend without confirmation)"],
    defaultScopes: SCOPES,

    authorizationUrl({ state, redirectUri, scopes }: AuthorizeParams) {
      const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", [...new Set([...SCOPES, ...(scopes ?? [])])].join(","));
      return u.toString();
    },

    async exchangeCode(code, redirectUri): Promise<Credential> {
      const short = await httpJson<TokenRes>(`${API}/oauth/access_token?${form({ client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri, code })}`);
      if (short.status >= 400 || !short.body.access_token) throw mapGraphError(short.status, short.body);
      const { token, expiresAt } = await exchangeLongLived(cfg, short.body.access_token);
      const me = await graph<{ id: string; name?: string }>("/me", cfg, token, { params: { fields: "id,name" } });
      const granted = await graph<{ data?: { permission: string; status: string }[] }>("/me/permissions", cfg, token);
      return { accessToken: token, expiresAt, scopes: (granted.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission), providerUserId: me.id, providerUserName: me.name };
    },

    async refresh(cred) {
      const { token, expiresAt } = await exchangeLongLived(cfg, cred.accessToken);
      return { ...cred, accessToken: token, expiresAt: expiresAt ?? cred.expiresAt };
    },

    async revoke(cred) {
      await graph("/me/permissions", cfg, cred.accessToken, { method: "DELETE" }).catch(() => undefined);
    },

    async listChannels(cred) {
      const pages = await graph<{ data?: PageNode[] }>("/me/accounts", cfg, cred.accessToken, { params: { fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}", limit: "100" } });
      return (pages.data ?? []).flatMap(pageToChannels);
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("This account is no longer available to your Meta login.", { category: "deleted" });
      return c;
    },

    validate(channel, req): ValidationIssue[] {
      const issues = validateAgainstCapabilities(channel.capabilities, req);
      if (channel.kind === "instagram_business" && req.format === "text") issues.push({ severity: "error", code: "ig_media_required", message: "Instagram posts need an image or video.", field: "media" });
      const badRatio = (m: { width?: number; height?: number; mimeType: string }) => m.mimeType.startsWith("image/") && m.width && m.height && (m.width / m.height < 0.8 || m.width / m.height > 1.91);
      if (channel.kind === "instagram_business" && req.media.some(badRatio)) issues.push({ severity: "warning", code: "ig_aspect_ratio", message: "Instagram crops images outside 4:5 – 1.91:1.", field: "media" });
      return issues;
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      return channel.kind === "facebook_page" ? publishToPage(cfg, cred, channel, req) : publishToInstagram(cfg, cred, channel, req);
    },

    findPublication: (cred, channel, key) => findPublication(cfg, cred, channel, key),
    publicationStatus: (cred, channel, remoteId) => publicationStatus(cfg, cred, channel, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(cfg, cred, channel, opts),
    reply: (cred, channel, req) => reply(cfg, cred, channel, req),
    findReply: (cred, channel, key) => findReply(cfg, cred, channel, key),
    fetchInsights: (cred, channel, req) => fetchInsights(cfg, cred, channel, req),
    inboxItemsFromWebhook(e) {
      const v = e.payload as { item?: string; verb?: string; comment_id?: string; post_id?: string; message?: string; from?: { id: string; name?: string }; created_time?: number; parent_id?: string } | undefined;
      if (!e.kind.endsWith(".feed") || v?.item !== "comment" || v.verb !== "add" || !v.comment_id || !v.from) return null;
      const at = v.created_time ? new Date(v.created_time * 1000).toISOString() : e.occurredAt;
      return [{ remoteId: v.comment_id, threadRemoteId: v.parent_id && v.parent_id !== v.post_id ? v.parent_id : v.comment_id, kind: "comment", direction: "inbound", author: { remoteId: v.from.id, name: v.from.name ?? "Unknown" }, text: v.message ?? "", occurredAt: at, inReplyToRemoteId: v.parent_id, postRemoteId: v.post_id }];
    },

    verifyWebhook({ headers, rawBody, query }) {
      if (query?.["hub.mode"] === "subscribe") return query["hub.verify_token"] === cfg.extra?.webhookVerifyToken;
      const sig = headers["x-hub-signature-256"] ?? headers["X-Hub-Signature-256"];
      if (!sig) return false;
      const expected = `sha256=${createHmac("sha256", cfg.clientSecret).update(rawBody).digest("hex")}`;
      return sig.length === expected.length && sig === expected;
    },

    parseWebhook(rawBody): WebhookEvent[] {
      const body = JSON.parse(rawBody) as { object?: string; entry?: { id: string; time: number; changes?: { field: string; value: unknown }[]; messaging?: unknown[] }[] };
      const out: WebhookEvent[] = [];
      for (const entry of body.entry ?? []) {
        const at = new Date(entry.time * 1000).toISOString();
        for (const [i, ch] of (entry.changes ?? []).entries()) out.push({ eventId: `${entry.id}:${entry.time}:${i}:${ch.field}`, channelRemoteId: entry.id, kind: `${body.object}.${ch.field}`, occurredAt: at, payload: ch.value });
        for (const [i, m] of (entry.messaging ?? []).entries()) out.push({ eventId: `${entry.id}:${entry.time}:m${i}`, channelRemoteId: entry.id, kind: `${body.object}.messaging`, occurredAt: at, payload: m });
      }
      return out;
    },
  };
  return provider;
}

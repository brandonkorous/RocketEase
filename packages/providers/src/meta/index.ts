/*
 * Meta adapter: Facebook Pages + Instagram Business via the Graph API (v21).
 * Confirm scopes/limits during Meta app review (integrations.md "Compliance").
 */
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { API, FB_CAPS, IG_CAPS, graph, mapGraphError, type GraphError } from "./graph";
import { findPublication, publicationStatus, publishToInstagram, publishToPage } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";
import { metaInboxItemsFromWebhook, parseMetaWebhook, verifyMetaWebhook } from "./webhooks";
import { fetchPaidInsights, fetchPaidObjects, findPromotion, listAdAccounts, promote, setPaidObjectStatus } from "./ads";

const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_metadata", "pages_read_user_content", "pages_manage_engagement", "pages_messaging", "instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_insights", "instagram_manage_messages", "business_management", "read_insights", "ads_read"];

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
    findReply: (cred, channel, lookup) => findReply(cfg, cred, channel, lookup),
    fetchInsights: (cred, channel, req) => fetchInsights(cfg, cred, channel, req),
    listAdAccounts: (cred) => listAdAccounts(cfg, cred),
    fetchPaidObjects: (cred, account) => fetchPaidObjects(cfg, cred, account),
    fetchPaidInsights: (cred, account, req) => fetchPaidInsights(cfg, cred, account, req),
    promote: (cred, account, req) => promote(cfg, cred, account, req),
    findPromotion: (cred, account, key) => findPromotion(cfg, cred, account, key),
    setPaidObjectStatus: (cred, _account, remoteId, status) => setPaidObjectStatus(cfg, cred, remoteId, status),
    inboxItemsFromWebhook: metaInboxItemsFromWebhook,
    verifyWebhook: (req) => verifyMetaWebhook(cfg, req),
    parseWebhook: parseMetaWebhook,

    /** Cheap probe: the channel node with its own token, plus granted vs required user permissions. */
    async healthCheck(cred, channel): Promise<HealthReport> {
      const required = channel.kind === "instagram_business" ? ["instagram_basic", "instagram_content_publish"] : ["pages_show_list", "pages_manage_posts"];
      const granted = await graph<{ data?: { permission: string; status: string }[] }>("/me/permissions", cfg, cred.accessToken).then((r) => (r.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission)).catch(() => cred.scopes);
      return probe(required, granted, () => graph(`/${channel.remoteId}`, cfg, channel.channelToken ?? cred.accessToken, { params: { fields: "id" } }));
    },
  };
  return provider;
}

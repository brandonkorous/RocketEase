/*
 * TikTok adapter via the Content Posting API (Direct Post). Requires an
 * approved app with video.publish; until then this ships behind a flag and
 * unapproved apps can only post as private/self-view. Photo posts use the
 * same API with post_mode/media_type PHOTO.
 */
import type { AuthorizeParams, Capabilities, ChannelDescriptor, ChannelKind, Credential, ProviderAdapter, ProviderConfig, PublishRequest, PublishResult, PublicationStatus, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, form, httpJson } from "../http";
import { validateAgainstCapabilities } from "../validate";

const API = "https://open.tiktokapis.com/v2";
const now = () => new Date().toISOString();

const CAPS = (): Capabilities => ({
  formats: ["video", "carousel"],
  scheduling: "internal",
  limits: { textMaxChars: 2200, imagesMax: 35, videoMaxSeconds: 600, hashtagsMax: 30, mentions: true, firstComment: false, links: "none", altText: false, videoMaxBytes: 4 * 1024 * 1024 * 1024 },
  inbox: { comments: true, mentions: false, messages: false, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: true, manage: false },
  ingestion: { webhooks: true, polling: true },
  reasons: { links: "TikTok captions don't render links.", firstComment: "Not exposed by the Content Posting API." },
  checkedAt: now(),
});

type TtError = { error?: { code?: string; message?: string; log_id?: string } };

function mapError(status: number, body: TtError, ambiguous = false) {
  const code = body?.error?.code;
  let category = categoryFromStatus(status);
  if (code === "access_token_invalid" || code === "scope_not_authorized") category = "permission";
  if (code === "rate_limit_exceeded") category = "rate_limit";
  if (code?.startsWith("invalid_")) category = "validation";
  return new ProviderError(body?.error?.message ?? `TikTok API error (${status})`, { category, providerCode: code, ambiguous });
}

export function createTikTokProvider(cfg: ProviderConfig): ProviderAdapter {
  const scopes = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.publish", "video.upload"];

  async function tt<T>(path: string, token: string, body?: unknown): Promise<T> {
    const res = await httpJson<T & TtError>(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeoutMs: 60_000,
    });
    const err = (res.body as TtError)?.error;
    if (res.status >= 400 || (err?.code && err.code !== "ok")) throw mapError(res.status, res.body as TtError, body !== undefined && res.status >= 500);
    return res.body;
  }

  const provider: ProviderAdapter = {
    key: "tiktok",
    displayName: "TikTok",
    networks: ["tiktok"],
    accessSummary: ["See your TikTok profile and stats", "Publish videos and photo posts to your account", "Read your videos and their performance"],
    defaultScopes: scopes,

    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
      u.searchParams.set("client_key", cfg.clientId);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", [...new Set([...scopes, ...(extra ?? [])])].join(","));
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      return u.toString();
    },

    async exchangeCode(code, redirectUri) {
      const res = await httpJson<{ access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; scope?: string } & TtError>(`${API}/oauth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ client_key: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
      });
      if (res.status >= 400 || !res.body.access_token) throw mapError(res.status, res.body);
      return { accessToken: res.body.access_token, refreshToken: res.body.refresh_token, expiresAt: res.body.expires_in ? new Date(Date.now() + res.body.expires_in * 1000).toISOString() : undefined, scopes: (res.body.scope ?? "").split(",").filter(Boolean), providerUserId: res.body.open_id ?? "unknown" };
    },

    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("TikTok token expired; reconnect required.", { category: "permission" });
      const res = await httpJson<{ access_token?: string; refresh_token?: string; expires_in?: number } & TtError>(`${API}/oauth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ client_key: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token", refresh_token: cred.refreshToken }),
      });
      if (res.status >= 400 || !res.body.access_token) throw mapError(res.status, res.body);
      return { ...cred, accessToken: res.body.access_token, refreshToken: res.body.refresh_token ?? cred.refreshToken, expiresAt: res.body.expires_in ? new Date(Date.now() + res.body.expires_in * 1000).toISOString() : cred.expiresAt };
    },

    async revoke(cred) {
      await httpJson(`${API}/oauth/revoke/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_key: cfg.clientId, client_secret: cfg.clientSecret, token: cred.accessToken }) }).catch(() => undefined);
    },

    async listChannels(cred) {
      const me = await tt<{ data?: { user?: { open_id: string; display_name?: string; username?: string; avatar_url?: string } } }>("/user/info/?fields=open_id,display_name,username,avatar_url", cred.accessToken);
      const u = me.data?.user;
      if (!u) return [];
      return [{ remoteId: u.open_id, kind: "tiktok_account", network: "tiktok", name: u.display_name ?? u.username ?? "TikTok", handle: u.username ? `@${u.username}` : undefined, avatarUrl: u.avatar_url, capabilities: CAPS() }];
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("TikTok account unavailable", { category: "deleted" });
      return c;
    },

    validate(channel, req): ValidationIssue[] {
      return validateAgainstCapabilities(channel.capabilities, req);
    },

    async publish(cred, channel, req: PublishRequest): Promise<PublishResult> {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const s = (req.settings ?? {}) as { privacy?: string; disableComment?: boolean; disableDuet?: boolean; disableStitch?: boolean };
      const postInfo = { title: req.text.slice(0, 2200), privacy_level: s.privacy ?? "PUBLIC_TO_EVERYONE", disable_comment: Boolean(s.disableComment), disable_duet: Boolean(s.disableDuet), disable_stitch: Boolean(s.disableStitch) };
      const video = req.media.find((m) => m.mimeType.startsWith("video/"));
      let publishId: string;
      if (video) {
        const r = await tt<{ data?: { publish_id?: string } }>("/post/publish/video/init/", cred.accessToken, { post_info: postInfo, source_info: { source: "PULL_FROM_URL", video_url: video.url } });
        publishId = r.data?.publish_id ?? "";
      } else {
        const r = await tt<{ data?: { publish_id?: string } }>("/post/publish/content/init/", cred.accessToken, { post_info: { ...postInfo, description: req.text }, source_info: { source: "PULL_FROM_URL", photo_images: req.media.map((m) => m.url), photo_cover_index: 0 }, post_mode: "DIRECT_POST", media_type: "PHOTO" });
        publishId = r.data?.publish_id ?? "";
      }
      if (!publishId) throw new ProviderError("TikTok returned no publish id", { category: "unknown", ambiguous: true });
      // Poll until published (TikTok processes asynchronously).
      for (let i = 0; i < 30; i++) {
        const st = await tt<{ data?: { status?: string; publicaly_available_post_id?: string[]; fail_reason?: string } }>("/post/publish/status/fetch/", cred.accessToken, { publish_id: publishId });
        const status = st.data?.status;
        if (status === "PUBLISH_COMPLETE") {
          const id = st.data?.publicaly_available_post_id?.[0] ?? publishId;
          return { remoteId: id, url: channel.handle ? `https://www.tiktok.com/${channel.handle}/video/${id}` : undefined, publishedAt: now() };
        }
        if (status === "FAILED") throw new ProviderError(`TikTok rejected the post (${st.data?.fail_reason ?? "unknown"})`, { category: "validation" });
        await new Promise((r) => setTimeout(r, 10_000));
      }
      throw new ProviderError("TikTok publish is still processing", { category: "temporary", ambiguous: true });
    },

    async findPublication(cred, _channel, idempotencyKey) {
      const r = await tt<{ data?: { videos?: { id: string; title?: string; create_time?: number; share_url?: string }[] } }>("/video/list/?fields=id,title,create_time,share_url", cred.accessToken, { max_count: 20 }).catch(() => ({ data: { videos: [] as { id: string; title?: string; create_time?: number; share_url?: string }[] } }));
      const marker = idempotencyKey.slice(0, 8);
      const hit = (r.data?.videos ?? []).find((v) => (v.title ?? "").includes(marker));
      return hit ? { remoteId: hit.id, url: hit.share_url, publishedAt: hit.create_time ? new Date(hit.create_time * 1000).toISOString() : now() } : null;
    },

    async publicationStatus(cred, _channel, remoteId): Promise<PublicationStatus> {
      const r = await tt<{ data?: { videos?: { id: string; share_url?: string }[] } }>("/video/query/?fields=id,share_url", cred.accessToken, { filters: { video_ids: [remoteId] } }).catch(() => null);
      const v = r?.data?.videos?.[0];
      return v ? { state: "published", url: v.share_url } : { state: "unknown" };
    },
  };
  return provider;
}

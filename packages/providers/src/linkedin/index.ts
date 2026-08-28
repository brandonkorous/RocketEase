/*
 * LinkedIn adapter: organization pages (and the member's own profile) via the
 * Community Management / Posts API (rest.linkedin.com, versioned). Image and
 * video uploads use the Images/Videos APIs (initializeUpload → PUT → reference).
 */
import type { AuthorizeParams, Capabilities, ChannelDescriptor, ChannelKind, Credential, ProviderAdapter, ProviderConfig, PublishRequest, PublishResult, PublicationStatus, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, form, httpJson } from "../http";
import { validateAgainstCapabilities } from "../validate";

const REST = "https://api.linkedin.com/rest";
const VERSION = "202411";
const now = () => new Date().toISOString();

const CAPS = (): Capabilities => ({
  formats: ["text", "image", "carousel", "video", "document"],
  scheduling: "internal",
  limits: { textMaxChars: 3000, imagesMax: 20, videoMaxSeconds: 600, mentions: true, firstComment: true, links: "inline", altText: true, videoMaxBytes: 5 * 1024 * 1024 * 1024 },
  inbox: { comments: true, mentions: false, messages: false, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: true, manage: false },
  ingestion: { webhooks: false, polling: true },
  reasons: { messages: "LinkedIn does not expose member messaging to third parties." },
  checkedAt: now(),
});

type LiError = { message?: string; serviceErrorCode?: number; code?: string };

function mapError(status: number, body: LiError | string, ambiguous = false) {
  const b = typeof body === "string" ? { message: body } : body;
  return new ProviderError(b?.message ?? `LinkedIn API error (${status})`, { category: categoryFromStatus(status), providerCode: b?.code ?? (b?.serviceErrorCode !== undefined ? String(b.serviceErrorCode) : undefined), ambiguous });
}

export function createLinkedInProvider(cfg: ProviderConfig): ProviderAdapter {
  const scopes = ["openid", "profile", "email", "w_member_social", "r_organization_social", "w_organization_social", "rw_organization_admin", "r_organization_admin"];

  async function li<T>(path: string, token: string, init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ body: T; headers: Headers }> {
    const method = init.method ?? "GET";
    const res = await httpJson<T & LiError>(`${REST}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json", ...(init.headers ?? {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      timeoutMs: method === "GET" ? 20_000 : 60_000,
    });
    if (res.status >= 400) throw mapError(res.status, res.body, method !== "GET" && res.status >= 500);
    return { body: res.body, headers: res.headers };
  }

  const provider: ProviderAdapter = {
    key: "linkedin",
    displayName: "LinkedIn",
    networks: ["linkedin"],
    accessSummary: ["See the LinkedIn Pages you administer", "Publish posts to those Pages and to your profile", "Read comments and reactions", "Read Page and post analytics"],
    defaultScopes: scopes,

    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", [...new Set([...scopes, ...(extra ?? [])])].join(" "));
      return u.toString();
    },

    async exchangeCode(code, redirectUri) {
      const res = await httpJson<{ access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string } & LiError>("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
      });
      if (res.status >= 400 || !res.body.access_token) throw mapError(res.status, res.body);
      const me = await httpJson<{ sub?: string; name?: string }>("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${res.body.access_token}` } });
      return {
        accessToken: res.body.access_token,
        refreshToken: res.body.refresh_token,
        expiresAt: res.body.expires_in ? new Date(Date.now() + res.body.expires_in * 1000).toISOString() : undefined,
        scopes: (res.body.scope ?? "").split(/[ ,]/).filter(Boolean),
        providerUserId: me.body.sub ?? "unknown",
        providerUserName: me.body.name,
      };
    },

    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("LinkedIn token expired; reconnect required.", { category: "permission" });
      const res = await httpJson<{ access_token?: string; expires_in?: number; refresh_token?: string } & LiError>("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
      });
      if (res.status >= 400 || !res.body.access_token) throw mapError(res.status, res.body);
      return { ...cred, accessToken: res.body.access_token, refreshToken: res.body.refresh_token ?? cred.refreshToken, expiresAt: res.body.expires_in ? new Date(Date.now() + res.body.expires_in * 1000).toISOString() : cred.expiresAt };
    },

    async revoke() {
      /* LinkedIn has no programmatic revoke for member tokens; we drop the secret locally. */
    },

    async listChannels(cred) {
      const out: ChannelDescriptor[] = [];
      const me = await httpJson<{ sub?: string; name?: string; picture?: string }>("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${cred.accessToken}` } });
      if (me.body.sub) out.push({ remoteId: `urn:li:person:${me.body.sub}`, kind: "linkedin_member", network: "linkedin", name: me.body.name ?? "My profile", avatarUrl: me.body.picture, capabilities: { ...CAPS(), inbox: { ...CAPS().inbox, comments: false, reply: false } } });
      const acls = await li<{ elements?: { organization: string; role: string; state: string }[] }>("/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100", cred.accessToken).catch(() => ({ body: { elements: [] as { organization: string; role: string; state: string }[] } }));
      for (const acl of acls.body.elements ?? []) {
        const id = acl.organization.split(":").pop()!;
        const org = await li<{ localizedName?: string; vanityName?: string }>(`/organizations/${id}`, cred.accessToken).catch(() => ({ body: {} as { localizedName?: string; vanityName?: string } }));
        out.push({ remoteId: acl.organization, kind: "linkedin_organization", network: "linkedin", name: org.body.localizedName ?? `Page ${id}`, handle: org.body.vanityName, capabilities: CAPS() });
      }
      return out;
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const all = await provider.listChannels(cred);
      const c = all.find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("This LinkedIn page is no longer administered by your login.", { category: "deleted" });
      return c;
    },

    validate(channel, req): ValidationIssue[] {
      return validateAgainstCapabilities(channel.capabilities, req);
    },

    async publish(cred, channel, req: PublishRequest): Promise<PublishResult> {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const author = channel.remoteId;
      const token = cred.accessToken;

      async function uploadMedia(kind: "images" | "videos", url: string, mime: string): Promise<string> {
        const init = await li<{ value: { uploadUrl?: string; uploadInstructions?: { uploadUrl: string }[]; image?: string; video?: string } }>(`/${kind}?action=initializeUpload`, token, { method: "POST", body: { initializeUploadRequest: { owner: author } } });
        const bin = await fetch(url).then((r) => r.arrayBuffer());
        const uploadUrl = init.body.value.uploadUrl ?? init.body.value.uploadInstructions?.[0]?.uploadUrl;
        if (!uploadUrl) throw new ProviderError("LinkedIn did not return an upload URL", { category: "temporary" });
        const put = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": mime }, body: bin });
        if (put.status >= 400) throw new ProviderError("LinkedIn media upload failed", { category: "temporary" });
        return (init.body.value.image ?? init.body.value.video)!;
      }

      const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
      const video = req.media.find((m) => m.mimeType.startsWith("video/"));
      let content: Record<string, unknown> | undefined;
      if (video) content = { media: { id: await uploadMedia("videos", video.url, video.mimeType), title: req.text.slice(0, 200) } };
      else if (images.length === 1) content = { media: { id: await uploadMedia("images", images[0].url, images[0].mimeType), altText: images[0].altText } };
      else if (images.length > 1) content = { multiImage: { images: await Promise.all(images.map(async (i) => ({ id: await uploadMedia("images", i.url, i.mimeType), altText: i.altText }))) } };
      else if (req.link) content = { article: { source: req.link, title: req.text.slice(0, 100) } };

      const res = await li<unknown>("/posts", token, {
        method: "POST",
        body: { author, commentary: req.text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(content ? { content } : {}) },
      });
      const remoteId = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
      if (!remoteId) throw new ProviderError("LinkedIn returned no post id", { category: "unknown", ambiguous: true });
      if (req.firstComment) await li(`/socialActions/${encodeURIComponent(remoteId)}/comments`, token, { method: "POST", body: { actor: author, message: { text: req.firstComment } } }).catch(() => undefined);
      return { remoteId, url: `https://www.linkedin.com/feed/update/${remoteId}`, publishedAt: now() };
    },

    async findPublication(cred, channel, idempotencyKey) {
      const res = await li<{ elements?: { id: string; commentary?: string; createdAt?: number }[] }>(`/posts?q=author&author=${encodeURIComponent(channel.remoteId)}&count=20&sortBy=LAST_MODIFIED`, cred.accessToken).catch(() => ({ body: { elements: [] as { id: string; commentary?: string; createdAt?: number }[] } }));
      const marker = idempotencyKey.slice(0, 8);
      const hit = (res.body.elements ?? []).find((p) => (p.commentary ?? "").includes(marker));
      return hit ? { remoteId: hit.id, url: `https://www.linkedin.com/feed/update/${hit.id}`, publishedAt: hit.createdAt ? new Date(hit.createdAt).toISOString() : now() } : null;
    },

    async publicationStatus(cred, _channel, remoteId): Promise<PublicationStatus> {
      try {
        await li(`/posts/${encodeURIComponent(remoteId)}`, cred.accessToken);
        return { state: "published", url: `https://www.linkedin.com/feed/update/${remoteId}` };
      } catch (e) {
        if (e instanceof ProviderError && e.category === "deleted") return { state: "deleted" };
        return { state: "unknown" };
      }
    },
  };
  return provider;
}

/*
 * LinkedIn adapter: organization Pages (and the member's own profile) via the
 * Community Management / Posts API. Publishing, inbox and insights live in
 * sibling modules; this file owns OAuth, channel discovery and health.
 */
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { applyDisclosure } from "../disclosure";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { li, mapLinkedInError, MEMBER_CAPS, OAUTH, ORG_CAPS, SCOPES, urnId, type LiError } from "./client";
import { findPublication, publicationStatus, publish } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";

const DEFAULT_SCOPES = [...SCOPES.identity, "email", ...SCOPES.member, ...SCOPES.orgRead, ...SCOPES.orgWrite, ...SCOPES.orgAdmin, "r_organization_admin"];
type TokenRes = { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string } & LiError;
type UserInfo = { sub?: string; name?: string; picture?: string };
type Acl = { organization: string; role: string; state: string };

async function token(body: Record<string, string>): Promise<TokenRes> {
  const res = await httpJson<TokenRes>(`${OAUTH}/accessToken`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(body) });
  if (res.status >= 400 || !res.body.access_token) throw mapLinkedInError(res.status === 200 ? 401 : res.status, res.body, { headers: res.headers });
  return res.body;
}

const expiry = (s: number | undefined, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);

async function userinfo(accessToken: string): Promise<UserInfo> {
  const me = await httpJson<UserInfo & LiError>("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (me.status >= 400) throw mapLinkedInError(me.status, me.body, { headers: me.headers });
  return me.body;
}

async function adminOrganizations(cred: Credential): Promise<ChannelDescriptor[]> {
  const acls = await li<{ elements?: Acl[] }>("/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100", cred.accessToken);
  const out: ChannelDescriptor[] = [];
  for (const acl of acls.body.elements ?? []) {
    const id = urnId(acl.organization);
    const org = await li<{ localizedName?: string; vanityName?: string }>(`/organizations/${id}`, cred.accessToken).catch(() => ({ body: {} as { localizedName?: string; vanityName?: string } }));
    const caps = ORG_CAPS();
    if (!cred.scopes.includes("w_organization_social")) Object.assign(caps, { formats: [], reasons: { ...caps.reasons, formats: "Publishing needs the w_organization_social permission." } });
    if (!cred.scopes.includes("rw_organization_admin")) Object.assign(caps, { insights: { organic: false, audience: false }, reasons: { ...caps.reasons, insights: "Analytics need the rw_organization_admin permission." } });
    out.push({ remoteId: acl.organization, kind: "linkedin_organization", network: "linkedin", name: org.body.localizedName ?? `Page ${id}`, handle: org.body.vanityName, capabilities: caps });
  }
  return out;
}

export function createLinkedInProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "linkedin",
    displayName: "LinkedIn",
    networks: ["linkedin"],
    accessSummary: ["See the LinkedIn Pages you administer", "Publish posts to those Pages and to your profile", "Read and reply to comments on your Page posts", "Read Page and post analytics"],
    defaultScopes: DEFAULT_SCOPES,

    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      const u = new URL(`${OAUTH}/authorization`);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", [...new Set([...DEFAULT_SCOPES, ...(extra ?? [])])].join(" "));
      return u.toString();
    },

    async exchangeCode(code, redirectUri): Promise<Credential> {
      const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret });
      const me = await userinfo(t.access_token!);
      return { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes: (t.scope ?? "").split(/[ ,]/).filter(Boolean), providerUserId: me.sub ?? "unknown", providerUserName: me.name };
    },

    /** Programmatic refresh tokens must be enabled on the LinkedIn app; without one the member must reconnect. */
    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("LinkedIn access expired; reconnect required.", { category: "permission", providerCode: "no_refresh_token" });
      const t = await token({ grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiry(t.expires_in, cred.expiresAt) };
    },

    async revoke(cred) {
      await httpJson(`${OAUTH}/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: cfg.clientId, client_secret: cfg.clientSecret, token: cred.accessToken }) }).catch(() => undefined);
    },

    async listChannels(cred) {
      const me = await userinfo(cred.accessToken);
      const out: ChannelDescriptor[] = [];
      if (me.sub) out.push({ remoteId: `urn:li:person:${me.sub}`, kind: "linkedin_member", network: "linkedin", name: me.name ?? "My profile", avatarUrl: me.picture, capabilities: MEMBER_CAPS() });
      out.push(...(await adminOrganizations(cred).catch((e) => (e instanceof ProviderError && e.category === "permission" ? [] : Promise.reject(e)))));
      return out;
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("This LinkedIn page is no longer administered by your login.", { category: "deleted" });
      return c;
    },

    async healthCheck(cred, channel): Promise<HealthReport> {
      const required = channel.kind === "linkedin_member" ? SCOPES.member : [...SCOPES.orgRead, ...SCOPES.orgWrite];
      const read = channel.kind === "linkedin_member" ? () => userinfo(cred.accessToken) : () => li(`/organizations/${urnId(channel.remoteId)}`, cred.accessToken);
      return probe(required, cred.scopes, read);
    },

    validate(channel, req): ValidationIssue[] {
      return validateAgainstCapabilities(channel.capabilities, req);
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const { request, emitted: disclosure } = applyDisclosure(channel, req);
      return { ...(await publish(cred, channel, request)), disclosure };
    },
    findPublication: (cred, channel, key) => findPublication(cred, channel, key),
    publicationStatus: (cred, _channel, remoteId) => publicationStatus(cred, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(cred, channel, opts),
    reply: (cred, channel, req) => reply(cred, channel, req),
    findReply: (cred, channel, lookup) => findReply(cred, channel, lookup),
    fetchInsights: (cred, channel, req) => fetchInsights(cred, channel, req),
    // No LinkedIn webhooks for Page comments/mentions: polling only (verifyWebhook/parseWebhook intentionally absent).
  };
  return provider;
}

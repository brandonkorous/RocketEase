/*
 * Mock provider — a complete adapter backed by an in-memory store so the
 * connect → select → sync → publish → reconcile loop can be exercised locally
 * and in tests without real provider credentials. Behaviour toggles let tests
 * simulate timeouts, rate limits, and revoked tokens.
 *
 * The "authorization server" is a route in the platform app
 * (/api/connect/mock/authorize) that renders a consent page and redirects back
 * with a code. Codes/tokens are just opaque strings validated here.
 */
import type {
  AuthorizeParams,
  Capabilities,
  ChannelDescriptor,
  ChannelKind,
  Credential,
  ProviderAdapter,
  PublishRequest,
  PublishResult,
  PublicationStatus,
  ValidationIssue,
} from "../types";
import { ProviderError } from "../types";
import type { InboxItem } from "../inbox-types";
import { validateAgainstCapabilities } from "../validate";
import { fetchInbox, findReply, mockInbox, reply } from "./inbox";
import { fetchInsights, mockInsights } from "./insights";
import { fetchPaidInsights, fetchPaidObjects, findPromotion, listAdAccounts, mockAds, promote, setPaidObjectStatus } from "./ads";

export { mockInbox, mockInsights, mockAds };

const now = () => new Date().toISOString();

const CAPS: Capabilities = {
  formats: ["text", "image", "carousel", "video"],
  scheduling: "internal",
  limits: { textMaxChars: 2200, imagesMax: 10, videoMaxSeconds: 90, hashtagsMax: 30, mentions: true, firstComment: true, links: "inline", altText: true },
  inbox: { comments: true, mentions: true, messages: true, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: true, manage: true },
  ingestion: { webhooks: true, polling: true },
  checkedAt: now(),
};

export type MockBehaviour = {
  /** Throw an ambiguous timeout on publish (but still record the post) — tests reconciliation. */
  ambiguousPublish?: boolean;
  /** Throw rate_limit on publish. */
  rateLimited?: boolean;
  /** Token treated as revoked. */
  revoked?: boolean;
};

type Store = {
  behaviour: MockBehaviour;
  posts: Map<string, PublishResult & { channelId: string; idempotencyKey: string; text: string }>;
  codes: Set<string>;
  revokedTokens: Set<string>;
};

const g = globalThis as unknown as { __misMockProvider?: Store };
const store = (): Store =>
  (g.__misMockProvider ??= { behaviour: {}, posts: new Map(), codes: new Set(), revokedTokens: new Set() });

export const mockControl = {
  set(b: MockBehaviour) {
    store().behaviour = { ...store().behaviour, ...b };
  },
  reset() {
    g.__misMockProvider = { behaviour: {}, posts: new Map(), codes: new Set(), revokedTokens: new Set() };
  },
  posts: () => [...store().posts.values()],
  /** Called by the authorize route after the user consents. */
  issueCode(): string {
    const code = `mock_code_${Math.random().toString(36).slice(2)}`;
    store().codes.add(code);
    return code;
  },
};

const CHANNELS: ChannelDescriptor[] = [
  { remoteId: "mock-brand-1", kind: "mock_profile", network: "mock", name: "Demo Brand", handle: "@demobrand", capabilities: CAPS },
  { remoteId: "mock-brand-2", kind: "mock_profile", network: "mock", name: "Demo Brand (Outlet)", handle: "@demobrandoutlet", capabilities: CAPS },
  {
    remoteId: "mock-brand-3",
    kind: "mock_profile",
    network: "mock",
    name: "Demo Brand (Read-only)",
    handle: "@demobrandro",
    capabilities: { ...CAPS, formats: [], reasons: { formats: "This profile granted read-only permissions." } },
  },
];

function assertToken(cred: Credential) {
  if (store().behaviour.revoked || store().revokedTokens.has(cred.accessToken) || !cred.accessToken.startsWith("mock_token_")) {
    throw new ProviderError("The connection was revoked. Reconnect to continue.", { category: "permission", providerCode: "revoked" });
  }
}

export const mockProvider: ProviderAdapter = {
  key: "mock",
  displayName: "Demo network",
  networks: ["mock"],
  accessSummary: ["See the demo profiles you manage", "Publish posts on your behalf", "Read comments and messages", "Read post and audience insights"],
  defaultScopes: ["profile", "publish", "inbox", "insights"],

  authorizationUrl({ state, redirectUri, scopes }: AuthorizeParams) {
    const u = new URL("/api/connect/mock/authorize", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", (scopes ?? mockProvider.defaultScopes).join(" "));
    return u.toString();
  },

  async exchangeCode(code) {
    if (!store().codes.delete(code)) throw new ProviderError("Invalid or expired authorization code", { category: "permission" });
    return {
      accessToken: `mock_token_${Math.random().toString(36).slice(2)}`,
      refreshToken: `mock_refresh_${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      scopes: mockProvider.defaultScopes,
      providerUserId: "mock-user-1",
      providerUserName: "Demo Marketer",
    };
  },

  async refresh(cred) {
    assertToken(cred);
    return { ...cred, accessToken: `mock_token_${Math.random().toString(36).slice(2)}`, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() };
  },

  async revoke(cred) {
    store().revokedTokens.add(cred.accessToken);
  },

  async listChannels(cred) {
    assertToken(cred);
    return CHANNELS.map((c) => ({ ...c, capabilities: { ...c.capabilities, checkedAt: now() } }));
  },

  async describeChannel(cred, remoteId, kind: ChannelKind) {
    assertToken(cred);
    const c = CHANNELS.find((x) => x.remoteId === remoteId && x.kind === kind);
    if (!c) throw new ProviderError("Profile no longer exists", { category: "deleted" });
    return { ...c, capabilities: { ...c.capabilities, checkedAt: now() } };
  },

  validate(channel, req): ValidationIssue[] {
    const issues = validateAgainstCapabilities(channel.capabilities, req);
    if (/\bforbidden\b/i.test(req.text)) issues.push({ severity: "error", code: "policy", message: "Text contains a term the demo network rejects.", field: "text" });
    return issues;
  },

  async publish(cred, channel, req: PublishRequest): Promise<PublishResult> {
    assertToken(cred);
    const issues = mockProvider.validate(channel, req).filter((i) => i.severity === "error");
    if (issues.length) throw new ProviderError(issues[0].message, { category: "validation", providerCode: issues[0].code });
    if (store().behaviour.rateLimited) throw new ProviderError("Rate limited", { category: "rate_limit", retryAfterSeconds: 30 });

    const existing = [...store().posts.values()].find((p) => p.idempotencyKey === req.idempotencyKey);
    if (existing) return existing; // idempotent

    const remoteId = `mockpost_${Math.random().toString(36).slice(2)}`;
    const result = { remoteId, url: `https://demo.invalid/${channel.handle ?? channel.remoteId}/${remoteId}`, publishedAt: now() };
    store().posts.set(remoteId, { ...result, channelId: channel.remoteId, idempotencyKey: req.idempotencyKey, text: req.text });

    if (store().behaviour.ambiguousPublish) {
      // The post exists remotely, but the caller never learns that — exactly the case reconciliation must catch.
      throw new ProviderError("Provider request timed out", { category: "temporary", ambiguous: true });
    }
    return result;
  },

  async findPublication(cred, _channel, idempotencyKey) {
    assertToken(cred);
    const p = [...store().posts.values()].find((x) => x.idempotencyKey === idempotencyKey);
    return p ? { remoteId: p.remoteId, url: p.url, publishedAt: p.publishedAt } : null;
  },

  async publicationStatus(cred, _channel, remoteId): Promise<PublicationStatus> {
    assertToken(cred);
    const p = store().posts.get(remoteId);
    return p ? { state: "published", url: p.url } : { state: "deleted" };
  },

  async fetchInbox(cred, channel, opts) { assertToken(cred); return fetchInbox(channel.remoteId, opts); },
  async reply(cred, channel, req) { assertToken(cred); return reply(channel.remoteId, req); },
  async findReply(cred, _channel, key) { assertToken(cred); return findReply(key); },
  async fetchInsights(cred, channel, req) { assertToken(cred); return fetchInsights(channel.remoteId, req); },
  async listAdAccounts(cred) { assertToken(cred); return listAdAccounts(); },
  async fetchPaidObjects(cred, account) { assertToken(cred); return fetchPaidObjects(account); },
  async fetchPaidInsights(cred, account, req) { assertToken(cred); return fetchPaidInsights(account, req); },
  async promote(cred, account, req) { assertToken(cred); return promote(account, req); },
  async findPromotion(cred, _account, key) { assertToken(cred); return findPromotion(key); },
  async setPaidObjectStatus(cred, _account, remoteId, status) { assertToken(cred); return setPaidObjectStatus(remoteId, status); },
  inboxItemsFromWebhook: (e) => (e.kind === "inbox.item" ? [e.payload as InboxItem] : null),
  async healthCheck(cred, channel) {
    try { assertToken(cred); } catch (e) { return { tokenOk: false, permissionsOk: false, missingScopes: [], message: (e as Error).message }; }
    const publishable = channel.capabilities.formats.length > 0;
    return { tokenOk: true, permissionsOk: publishable, missingScopes: publishable ? [] : ["publish"], message: publishable ? undefined : channel.capabilities.reasons?.formats };
  },

  verifyWebhook: () => true,
  parseWebhook(rawBody) {
    const body = JSON.parse(rawBody) as { events?: { id: string; channel: string; kind: string; at: string; data: unknown }[] };
    return (body.events ?? []).map((e) => ({ eventId: e.id, channelRemoteId: e.channel, kind: e.kind, occurredAt: e.at, payload: e.data }));
  },
};

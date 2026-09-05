/*
 * The adapter surface itself. Every network implements this; the platform
 * calls nothing else. Types it is built from live in types.ts, which
 * re-exports this file so "../types" stays the one import for adapters.
 */
import type { DisclosureInput } from "./disclosure";
import type { InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "./inbox-types";
import type { InsightsPage, InsightsRequest } from "./insights-types";
import type { AdAccountDescriptor, PaidInsightsPage, PaidInsightsRequest, PaidObjects, PromotionRequest, PromotionResult } from "./ads-types";
import type { ChannelDescriptor, ChannelKind, Credential, HealthReport, Network, ProviderKey, PublicationStatus, PublishRequest, PublishResult, ValidationIssue, WebhookEvent } from "./types";

export type AuthorizeParams = {
  state: string;
  redirectUri: string;
  /** Extra scopes beyond the adapter defaults (e.g. ads). */
  scopes?: string[];
  /**
   * PKCE (RFC 7636) challenge for providers that require it — X mandates it.
   * The caller derives it from the verifier it will pass to `exchangeCode`.
   */
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
};

/** One input on a credentials sign-in form (networks with no OAuth, such as Bluesky). */
export type CredentialField = {
  name: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  help?: string;
  autoComplete?: string;
};

export type CredentialsForm = {
  title: string;
  /** One or two sentences on what the person is handing over and why it is safe. */
  intro: string;
  fields: CredentialField[];
  help?: { label: string; href: string };
};

export interface ProviderAdapter {
  readonly key: ProviderKey;
  readonly displayName: string;
  readonly networks: Network[];
  /** Plain-language description of what access we ask for (integrations.md step 1). */
  readonly accessSummary: string[];
  readonly defaultScopes: string[];

  /**
   * Present when the network signs in with credentials instead of OAuth. The
   * platform renders this form and calls `signIn`; `authorizationUrl` and
   * `exchangeCode` are then unused and may throw.
   */
  readonly credentialsForm?: CredentialsForm;
  signIn?(values: Record<string, string>): Promise<Credential>;

  authorizationUrl(params: AuthorizeParams): string;
  /** `codeVerifier` is required by providers that mandate PKCE (X); ignored by the rest. */
  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<Credential>;
  refresh(cred: Credential): Promise<Credential>;
  revoke(cred: Credential): Promise<void>;

  /** Channels the credential can manage; the USER picks which join the workspace. */
  listChannels(cred: Credential): Promise<ChannelDescriptor[]>;
  /** Re-check capabilities/health for one channel. */
  describeChannel(cred: Credential, remoteId: string, kind: ChannelKind): Promise<ChannelDescriptor>;

  validate(channel: ChannelDescriptor, request: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[];
  publish(cred: Credential, channel: ChannelDescriptor, request: PublishRequest): Promise<PublishResult>;
  /** Reconciliation after an ambiguous failure: did the remote object get created? */
  findPublication(cred: Credential, channel: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null>;
  publicationStatus(cred: Credential, channel: ChannelDescriptor, remoteId: string): Promise<PublicationStatus>;

  /** Inbox: pull new items since a cursor/time. Optional — channels without it are webhook-only. */
  fetchInbox?(cred: Credential, channel: ChannelDescriptor, opts: { since?: string; cursor?: string }): Promise<InboxPage>;
  reply?(cred: Credential, channel: ChannelDescriptor, request: ReplyRequest): Promise<ReplyResult>;
  /** Reconcile an ambiguous reply before any retry (by client reference where the network has one, structurally otherwise). */
  findReply?(cred: Credential, channel: ChannelDescriptor, lookup: ReplyLookup): Promise<ReplyResult | null>;
  /** Organic insights as daily facts (channel + post level). Optional. */
  fetchInsights?(cred: Credential, channel: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage>;
  /** Turn a parsed webhook event into inbox items (null = not an inbox event). */
  inboxItemsFromWebhook?(event: WebhookEvent): InboxItem[] | null;

  /** Paid (ads-types.ts): read-only imports; `promote` is the only spend mutation and needs explicit user confirmation (CAM-002). */
  listAdAccounts?(cred: Credential): Promise<AdAccountDescriptor[]>;
  fetchPaidObjects?(cred: Credential, account: AdAccountDescriptor): Promise<PaidObjects>;
  fetchPaidInsights?(cred: Credential, account: AdAccountDescriptor, req: PaidInsightsRequest): Promise<PaidInsightsPage>;
  promote?(cred: Credential, account: AdAccountDescriptor, req: PromotionRequest): Promise<PromotionResult>;
  /** Reconcile an ambiguous promotion by idempotency key before any retry. */
  findPromotion?(cred: Credential, account: AdAccountDescriptor, idempotencyKey: string): Promise<PromotionResult | null>;
  setPaidObjectStatus?(cred: Credential, account: AdAccountDescriptor, remoteId: string, status: "active" | "paused"): Promise<void>;
  /** Verify the token and required permissions with a cheap read; never throws for permission errors. */
  healthCheck?(cred: Credential, channel: ChannelDescriptor): Promise<HealthReport>;

  verifyWebhook?(req: { headers: Record<string, string>; rawBody: string; query?: Record<string, string> }): boolean;
  parseWebhook?(rawBody: string): WebhookEvent[];

  /**
   * Verify and decode a provider-signed deauthorize / data-deletion callback.
   * Returns null when the signature does not verify — never throw, and never
   * treat an unverified body as a request (providers re-test these endpoints).
   */
  parseSignedRequest?(rawBody: string): SignedRequest | null;
}

/** A verified deauthorize / data-deletion callback from a provider. */
export type SignedRequest = {
  /** The provider's id for the person who revoked access or asked for deletion. */
  remoteUserId: string;
  issuedAt?: number;
  payload: Record<string, unknown>;
};

export type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  /** Optional per-provider knobs (API version, app secret proof, etc.). */
  extra?: Record<string, string>;
};

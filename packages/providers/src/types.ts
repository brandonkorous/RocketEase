/*
 * Provider adapter contract (docs/originals/integrations.md, architecture.md).
 *
 * Every adapter implements the same surface. Capabilities are declared per
 * CHANNEL, never per provider, and the UI derives validation and controls from
 * them — it must never assume parity between networks.
 */

import type { DisclosureEmission, DisclosureInput, DisclosureSupport } from "./disclosure";
import type { InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "./inbox-types";
import type { InsightsPage, InsightsRequest } from "./insights-types";
import type { AdAccountDescriptor, PaidInsightsPage, PaidInsightsRequest, PaidObjects, PromotionRequest, PromotionResult } from "./ads-types";

export type ProviderKey = "mock" | "meta" | "linkedin" | "tiktok" | "youtube" | "pinterest" | "x" | "google_business";

/** The social network a channel belongs to (drives platform identity/color in the UI). */
export type Network = "instagram" | "facebook" | "linkedin" | "tiktok" | "x" | "youtube" | "pinterest" | "google_business" | "mock";

export type ChannelKind =
  | "instagram_business"
  | "facebook_page"
  | "linkedin_organization"
  | "linkedin_member"
  | "tiktok_account"
  | "youtube_channel"
  /** Pinterest analytics are account-wide; pins are published to a board. */
  | "pinterest_account"
  | "pinterest_board"
  | "x_account"
  /** A Google Business Profile location: reviews only, nothing is published to it. */
  | "gbp_location"
  | "mock_profile";

/** Decrypted credential. Only ever lives in memory on the server. */
export type Credential = {
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp; undefined = provider says it doesn't expire. */
  expiresAt?: string;
  scopes: string[];
  /** Provider-side identity the token belongs to (user id / member urn). */
  providerUserId: string;
  providerUserName?: string;
};

export type PublishFormat = "text" | "image" | "carousel" | "video" | "reel" | "story" | "document";

export type Capabilities = {
  /** Publish formats this channel accepts right now. */
  formats: PublishFormat[];
  scheduling: "native" | "internal" | "none";
  limits: {
    textMaxChars?: number;
    imagesMax?: number;
    videoMaxSeconds?: number;
    videoMaxBytes?: number;
    imageMaxBytes?: number;
    hashtagsMax?: number;
    mentions?: boolean;
    firstComment?: boolean;
    links?: "inline" | "attached" | "none";
    altText?: boolean;
  };
  inbox: { comments: boolean; mentions: boolean; messages: boolean; reviews: boolean; reply: boolean };
  insights: { organic: boolean; audience: boolean };
  ads: { import: boolean; manage: boolean };
  ingestion: { webhooks: boolean; polling: boolean };
  /** How synthetic media is disclosed here: a real API field, a caption line, or not at all.
   *  Optional so capabilities stored before this field still parse; absent reads as "caption". */
  disclosure?: DisclosureSupport;
  /** How a video's cover frame can be chosen at publish time. Absent reads as "none". */
  cover?: CoverSupport;
  /** Explain-ability: why something is off, and when we last checked. */
  reasons?: Partial<Record<string, string>>;
  checkedAt: string;
};

export type ChannelDescriptor = {
  remoteId: string;
  kind: ChannelKind;
  network: Network;
  name: string;
  handle?: string;
  avatarUrl?: string;
  /** Some providers return per-channel tokens (Facebook Pages). */
  channelToken?: string;
  capabilities: Capabilities;
};

export type ErrorCategory = "permission" | "validation" | "rate_limit" | "temporary" | "deleted" | "policy" | "unknown";

export class ProviderError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly providerCode?: string;
  /** True when we cannot tell whether the side effect happened (timeouts, 5xx after send). */
  readonly ambiguous: boolean;
  readonly retryAfterSeconds?: number;
  constructor(
    message: string,
    opts: { category: ErrorCategory; retryable?: boolean; providerCode?: string; ambiguous?: boolean; retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.category = opts.category;
    this.retryable = opts.retryable ?? (opts.category === "temporary" || opts.category === "rate_limit");
    this.providerCode = opts.providerCode;
    this.ambiguous = opts.ambiguous ?? false;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

export type MediaInput = {
  /** Publicly fetchable (signed) URL the provider can pull from. */
  url: string;
  mimeType: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  altText?: string;
};

/**
 * "offset": the network picks the frame at a time offset we send (Instagram Reels,
 * TikTok). "image": it takes an uploaded picture. "none": covers are not settable
 * through the API, and the adapter's `reasons.cover` says why.
 */
export type CoverSupport = "offset" | "image" | "none";

/** The cover frame the author chose for a video. Adapters send what their API takes. */
export type PublishCover = {
  /** Milliseconds into the video. */
  offsetMs: number;
  /** A signed URL of that frame as a picture, for networks that take an image. */
  imageUrl?: string;
};

export type PublishRequest = {
  /** Stable key; the same key must never create a second remote object. */
  idempotencyKey: string;
  format: PublishFormat;
  text: string;
  media: MediaInput[];
  link?: string;
  firstComment?: string;
  /** Chosen cover frame for the video, when the author picked one. */
  cover?: PublishCover;
  /** Provider-specific knobs, validated by the adapter. */
  settings?: Record<string, unknown>;
  /** AI disclosure the author declared; adapters map it to a field or a caption line. */
  disclosure?: DisclosureInput;
};

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  field?: "text" | "media" | "link" | "firstComment" | "settings" | "schedule";
};

export type PublishResult = {
  remoteId: string;
  url?: string;
  publishedAt: string;
  /** How AI disclosure was actually emitted for this publication. */
  disclosure?: DisclosureEmission;
};

export type PublicationStatus = { state: "published" | "processing" | "deleted" | "unknown"; url?: string };

/** Cheap token/permission probe (integrations.md connection health). */
export type HealthReport = { tokenOk: boolean; permissionsOk: boolean; missingScopes: string[]; message?: string };

export type WebhookEvent = {
  /** Provider-unique event id for dedupe. */
  eventId: string;
  channelRemoteId?: string;
  kind: string;
  occurredAt: string;
  payload: unknown;
};

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

export interface ProviderAdapter {
  readonly key: ProviderKey;
  readonly displayName: string;
  readonly networks: Network[];
  /** Plain-language description of what access we ask for (integrations.md step 1). */
  readonly accessSummary: string[];
  readonly defaultScopes: string[];

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

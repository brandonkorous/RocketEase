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

export type ProviderKey = "mock" | "meta" | "linkedin" | "tiktok" | "youtube" | "pinterest" | "x" | "google_business" | "threads" | "bluesky";

/** The social network a channel belongs to (drives platform identity/color in the UI). */
export type Network = "instagram" | "facebook" | "linkedin" | "tiktok" | "x" | "youtube" | "pinterest" | "google_business" | "threads" | "bluesky" | "mock";

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
  | "threads_profile"
  /** One Bluesky account (a DID), signed in with an app password rather than OAuth. */
  | "bluesky_account"
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

export { ProviderError, isProviderError, type ErrorCategory } from "./errors";
export * from "./adapter";

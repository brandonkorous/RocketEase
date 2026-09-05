import type { DisclosureSupport, ValidationIssue } from "@rocketease/providers";
import type { SyntheticFlag } from "@/db/schema/content";
import type { LightboxMedia } from "../shared/media-lightbox";

export type ComposerChannel = { id: string; provider: string; network: string; kind: string; name: string; handle: string | null; avatarUrl: string | null; status: string; formats: string[]; textMax: number | null; hashtagsMax: number | null; firstComment: boolean; links: string; disclosure: DisclosureSupport; disclosureReason: string | null };
/** `thumbUrl` is the grid-sized rendition; `previewUrl` is the full-size original the lightbox shows. */
export type ComposerAsset = { id: string; kind: "image" | "video"; fileName: string; altText: string | null; thumbUrl: string | null; previewUrl: string | null; scanClean: boolean; width: number | null; height: number | null };
export type VariantState = { format: string; textOverride: string | null; assetIdsOverride: string[] | null; firstComment: string | null; linkOverride: string | null; validation: ValidationIssue[] };
export type ComposerItem = { id: string; title: string; status: string; approvalState: string; sharedText: string; sharedAssetIds: string[]; link: string | null; scheduledAtLocal: string | null; channelIds: string[]; variants: Record<string, VariantState>; syntheticFlag: SyntheticFlag; syntheticNote: string };
export type Override = { textOverride: string | null; firstComment: string; linkOverride: string | null };
export type Method = "now" | "schedule" | "draft" | "review";
/** `dueHours` is the policy window a request falls back to when the requester sets no due time. */
export type Approval = { required: boolean; policyName?: string; state: string; dueHours?: number };
export type Reviewer = { userId: string; name: string; role: string };
export type Issue = ValidationIssue & { channelId: string };

/** What the lightbox shows for a composer asset: the original, falling back to the thumbnail. */
export const lightboxMedia = (assets: ComposerAsset[]): LightboxMedia[] =>
  assets.map((a) => ({ id: a.id, kind: a.kind, src: a.previewUrl ?? a.thumbUrl, alt: a.altText, caption: a.fileName }));

export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", x: "X (Twitter)", youtube: "YouTube", pinterest: "Pinterest", google_business: "Google Business Profile", threads: "Threads", bluesky: "Bluesky", mock: "Demo network" };

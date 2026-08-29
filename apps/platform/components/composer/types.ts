import type { DisclosureSupport, ValidationIssue } from "@make-it-social/providers";
import type { SyntheticFlag } from "@/db/schema/content";

export type ComposerChannel = { id: string; provider: string; network: string; kind: string; name: string; handle: string | null; avatarUrl: string | null; status: string; formats: string[]; textMax: number | null; hashtagsMax: number | null; firstComment: boolean; links: string; disclosure: DisclosureSupport; disclosureReason: string | null };
export type ComposerAsset = { id: string; kind: "image" | "video"; fileName: string; altText: string | null; thumbUrl: string | null; previewUrl: string | null; scanClean: boolean; width: number | null; height: number | null };
export type VariantState = { format: string; textOverride: string | null; assetIdsOverride: string[] | null; firstComment: string | null; linkOverride: string | null; validation: ValidationIssue[] };
export type ComposerItem = { id: string; title: string; status: string; approvalState: string; sharedText: string; sharedAssetIds: string[]; link: string | null; scheduledAtLocal: string | null; channelIds: string[]; variants: Record<string, VariantState>; syntheticFlag: SyntheticFlag; syntheticNote: string };
export type Override = { textOverride: string | null; firstComment: string; linkOverride: string | null };
export type Method = "now" | "schedule" | "draft" | "review";
export type Approval = { required: boolean; policyName?: string; state: string };
export type Reviewer = { userId: string; name: string; role: string };
export type Issue = ValidationIssue & { channelId: string };

export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", x: "X (Twitter)", youtube: "YouTube", pinterest: "Pinterest", google_business: "Google Business Profile", mock: "Demo network" };

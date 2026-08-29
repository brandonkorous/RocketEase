/*
 * Ad copy field limits per network.
 *
 * Same rule as packages/providers/src/cost.ts: every number is sourced, and a
 * number we could not source is marked `verified: false` so it can only ever
 * raise a WARNING — never an error, and never a silent truncation.
 *
 * Sources (checked 2026-08-28)
 *   Meta      https://www.facebook.com/business/ads-guide/image/facebook-feed/traffic
 *             Feed image ad: primary text "50-150 characters", headline "27 characters".
 *             The guide lists no description field for the Feed image placement, and
 *             publishes no hard maximum, so no max is recorded here.
 *   LinkedIn  https://business.linkedin.com/marketing-solutions/success/ads-guide/single-image-ads
 *             Single image sponsored content: introductory text 150, headline 70,
 *             description 70 (LinkedIn Audience Network only).
 *   TikTok    UNVERIFIED. ads.tiktok.com help articles and the Business API portal
 *             returned errors / empty documents on 2026-08-28, so nothing could be
 *             confirmed first-hand. 100 characters maximum with 4-60 recommended is
 *             widely reported (e.g. lettercounter.org/blog/tiktok-ads-character-limits,
 *             triplewhale.com/blog/tiktok-ad-spec) — treated as unverified guidance.
 */

export type AdField = "primaryText" | "headline" | "description";

export type AdFieldSpec = {
  label: string;
  /** Length the network itself recommends; over it we warn about truncation. */
  recommended?: number;
  /** Hard ceiling. Only an error when `verified` — we never fail copy on a guess. */
  max?: number;
  /** False when the number could not be confirmed from the network's own docs. */
  verified: boolean;
  /** Shown under the meter. Says what the number is and where it came from. */
  note: string;
  /** True when the network has no such field on the placement we write for. */
  unavailable?: boolean;
};

export type AdSpec = {
  networkLabel: string;
  /** The placement these numbers describe. Shown in the UI so nothing reads as universal. */
  placement: string;
  sourceUrl: string;
  verified: boolean;
  fields: Record<AdField, AdFieldSpec>;
};

const META: AdSpec = {
  networkLabel: "Meta",
  placement: "Facebook / Instagram feed image ad",
  sourceUrl: "https://www.facebook.com/business/ads-guide/image/facebook-feed/traffic",
  verified: true,
  fields: {
    primaryText: { label: "Primary text", recommended: 150, verified: true, note: "Meta recommends 50–150 characters; longer copy is hidden behind “See more”." },
    headline: { label: "Headline", recommended: 27, verified: true, note: "Meta recommends 27 characters. Longer headlines are truncated in feed." },
    description: { label: "Description", verified: false, note: "Meta's feed image ad guide lists no description field, and no length for it. Some placements show one — keep it short.", unavailable: true },
  },
};

const LINKEDIN: AdSpec = {
  networkLabel: "LinkedIn",
  placement: "Sponsored content, single image ad",
  sourceUrl: "https://business.linkedin.com/marketing-solutions/success/ads-guide/single-image-ads",
  verified: true,
  fields: {
    primaryText: { label: "Introductory text", recommended: 150, verified: true, note: "LinkedIn's ads guide gives 150 characters for introductory text; beyond that it truncates." },
    headline: { label: "Headline", recommended: 70, verified: true, note: "LinkedIn's ads guide gives 70 characters for the headline." },
    description: { label: "Description", recommended: 70, verified: true, note: "70 characters. Only used when the ad runs on the LinkedIn Audience Network." },
  },
};

const TIKTOK: AdSpec = {
  networkLabel: "TikTok",
  placement: "In-feed ad",
  sourceUrl: "https://ads.tiktok.com/help/",
  verified: false,
  fields: {
    primaryText: { label: "Ad text", recommended: 60, max: 100, verified: false, note: "Unverified: TikTok's own spec pages were unreachable. 100 characters is widely reported as the maximum, 4–60 avoids truncation." },
    headline: { label: "Headline", verified: false, note: "TikTok in-feed ads have no separate headline; the ad text carries everything.", unavailable: true },
    description: { label: "Description", verified: false, note: "TikTok in-feed ads have no separate description field.", unavailable: true },
  },
};

/** Local demo network so the flow is exercisable without a real ad account. */
const MOCK: AdSpec = {
  networkLabel: "Demo network",
  placement: "Demo in-feed ad (local development only)",
  sourceUrl: "",
  verified: false,
  fields: {
    primaryText: { label: "Primary text", recommended: 150, verified: false, note: "Illustrative only — the demo network is not a real ad platform." },
    headline: { label: "Headline", recommended: 40, verified: false, note: "Illustrative only — the demo network is not a real ad platform." },
    description: { label: "Description", recommended: 40, verified: false, note: "Illustrative only — the demo network is not a real ad platform." },
  },
};

/** Networks we can write ad copy for. Anything absent gets no ad section at all. */
export const AD_SPECS: Record<string, AdSpec> = {
  facebook: META,
  instagram: META,
  linkedin: LINKEDIN,
  tiktok: TIKTOK,
  mock: MOCK,
};

export const adSpecFor = (network: string): AdSpec | undefined => AD_SPECS[network];

export const AD_FIELDS: AdField[] = ["primaryText", "headline", "description"];

export type AdFieldIssue = { severity: "error" | "warning"; field: AdField; message: string };

/**
 * Length check for one field. An unverified ceiling can only warn — we would
 * rather show a soft "this may be too long" than block copy on a number the
 * network never published.
 */
export function checkAdField(spec: AdFieldSpec, field: AdField, value: string): AdFieldIssue[] {
  const text = value.trim();
  if (spec.unavailable) {
    return text ? [{ severity: "warning", field, message: `${spec.label} isn't used here — it won't be shown.` }] : [];
  }
  if (!text) return [{ severity: "warning", field, message: `${spec.label} is empty.` }];
  const issues: AdFieldIssue[] = [];
  if (spec.max !== undefined && text.length > spec.max) {
    issues.push({
      severity: spec.verified ? "error" : "warning",
      field,
      message: `${spec.label} is ${text.length - spec.max} characters over the ${spec.max} limit${spec.verified ? "" : " (unverified)"}.`,
    });
  } else if (spec.recommended !== undefined && text.length > spec.recommended) {
    issues.push({ severity: "warning", field, message: `${spec.label} is ${text.length} characters; ${spec.recommended} is the recommended length.` });
  }
  return issues;
}

/** Every field of one ad variant, in field order. */
export function validateAdCopy(spec: AdSpec, copy: Record<AdField, string>): AdFieldIssue[] {
  return AD_FIELDS.flatMap((f) => checkAdField(spec.fields[f], f, copy[f] ?? ""));
}

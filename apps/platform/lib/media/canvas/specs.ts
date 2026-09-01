/*
 * Ad canvas specs — the geometry of a placement.
 *
 * Same rule as lib/ai/generator/ad-specs.ts and packages/providers/src/cost.ts:
 * every number is sourced, and a number we could not read from the network's own
 * documentation is `verified: false` so it can only ever raise a WARNING.
 *
 * The distinction matters here more than anywhere else. A wrong CANVAS makes an
 * upload fail; a wrong SAFE ZONE just makes an ad worse. So dimensions block and
 * safe zones warn — and the warning says where the number came from.
 *
 * Sources (checked 2026-08-28, recorded in docs/research/ai-media-2026.md §6)
 *   Meta ratios/dimensions  https://www.facebook.com/business/ads-guide/image/facebook-feed/traffic
 *   Meta safe zone          UNVERIFIED. 14% top / 35% bottom / 6% sides is reported consistently
 *                           across 2026 guides (behaviour.digital, billo.app, tryvizup.com) after
 *                           Meta unified Stories and Reels in March 2026, but Meta publishes no
 *                           machine-readable spec and none of these are Meta's own page.
 *   TikTok                  UNVERIFIED. ads.tiktok.com returned errors on 2026-08-28 — the same
 *                           finding ad-specs.ts records. 9:16, >=720p, sound-on is widely reported.
 *   LinkedIn / YouTube      UNVERIFIED. Not read first-hand; treated as guidance only.
 */

export const PLACEMENTS = [
  "meta_feed_4x5",
  "meta_feed_1x1",
  "meta_reels_9x16",
  "tiktok_infeed_9x16",
  "linkedin_feed_1x1",
  "youtube_shorts_9x16",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Fractions of the canvas reserved for platform chrome. 0.14 = the top 14%. */
export type SafeZone = { top: number; bottom: number; left: number; right: number };

export type CanvasSpec = {
  label: string;
  networkLabel: string;
  /** The network a rights/clearance check reads. Matches connection provider keys. */
  network: string;
  width: number;
  height: number;
  /** Smallest edge the network accepts. Below it we block, when verified. */
  minWidth: number;
  /** True when width/height came from the network's own published spec. */
  verified: boolean;
  sourceUrl: string;
  note: string;
  safeZone: SafeZone;
  /** True when the safe-zone fractions came from the network's own spec. Currently never. */
  safeZoneVerified: boolean;
  safeZoneNote: string;
  /** Video only, kept here so 12.4 inherits the table rather than forking it. */
  durationSeconds?: { min: number; max: number };
  /** Whether the placement autoplays with sound. Drives the caption requirement. */
  soundOn: boolean;
};

const META_SOURCE = "https://www.facebook.com/business/ads-guide/image/facebook-feed/traffic";

/** Meta unified Stories and Reels onto one safe zone in March 2026. */
const META_SAFE: SafeZone = { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 };
const META_SAFE_NOTE =
  "14% top / 35% bottom / 6% sides. Reported consistently across 2026 guides after Meta unified Stories and Reels, but not published by Meta in a form we could read — so this warns rather than blocks.";

/** A feed image sits in a card, not under full-bleed chrome: only the caption crowds it. */
const FEED_SAFE: SafeZone = { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 };
const FEED_SAFE_NOTE = "A 5% margin. Feed images are not overlaid by platform UI; this is a typographic margin, not a platform rule.";

export const CANVAS_SPECS: Record<Placement, CanvasSpec> = {
  meta_feed_4x5: {
    label: "Facebook / Instagram feed (4:5)",
    networkLabel: "Meta",
    network: "meta",
    width: 1080,
    height: 1350,
    minWidth: 1080,
    verified: true,
    sourceUrl: META_SOURCE,
    note: "1080×1350. Meta steered advertisers off square toward taller ratios through 2026; 4:5 is the tallest the feed renders without cropping.",
    safeZone: FEED_SAFE,
    safeZoneVerified: false,
    safeZoneNote: FEED_SAFE_NOTE,
    soundOn: false,
  },
  meta_feed_1x1: {
    label: "Facebook / Instagram feed (1:1)",
    networkLabel: "Meta",
    network: "meta",
    width: 1080,
    height: 1080,
    minWidth: 1080,
    verified: true,
    sourceUrl: META_SOURCE,
    note: "1080×1080. Still the safe default for carousels, where every card must share one ratio.",
    safeZone: FEED_SAFE,
    safeZoneVerified: false,
    safeZoneNote: FEED_SAFE_NOTE,
    soundOn: false,
  },
  meta_reels_9x16: {
    label: "Instagram / Facebook Reels and Stories (9:16)",
    networkLabel: "Meta",
    network: "meta",
    width: 1080,
    height: 1920,
    minWidth: 1080,
    verified: true,
    sourceUrl: META_SOURCE,
    note: "1080×1920. One placement since March 2026 — Stories and Reels share a canvas and a safe zone.",
    safeZone: META_SAFE,
    safeZoneVerified: false,
    safeZoneNote: META_SAFE_NOTE,
    durationSeconds: { min: 1, max: 90 },
    soundOn: true,
  },
  tiktok_infeed_9x16: {
    label: "TikTok in-feed (9:16)",
    networkLabel: "TikTok",
    network: "tiktok",
    width: 1080,
    height: 1920,
    minWidth: 720,
    verified: false,
    sourceUrl: "https://ads.tiktok.com/help/",
    note: "Unverified: TikTok's own spec pages were unreachable on 2026-08-28. 9:16 at 720p or better is widely reported as the floor.",
    safeZone: { top: 0.1, bottom: 0.32, left: 0.06, right: 0.15 },
    safeZoneVerified: false,
    safeZoneNote: "Unverified. TikTok's right rail (avatar, likes, comments, shares) and the bottom caption block are the crowded edges.",
    durationSeconds: { min: 5, max: 60 },
    soundOn: true,
  },
  linkedin_feed_1x1: {
    label: "LinkedIn feed (1:1)",
    networkLabel: "LinkedIn",
    network: "linkedin",
    width: 1080,
    height: 1080,
    minWidth: 1080,
    verified: false,
    sourceUrl: "https://business.linkedin.com/marketing-solutions/success/ads-guide/single-image-ads",
    note: "Unverified: LinkedIn's canvas dimensions were not read first-hand. 1:1 renders without cropping in the feed.",
    safeZone: FEED_SAFE,
    safeZoneVerified: false,
    safeZoneNote: FEED_SAFE_NOTE,
    soundOn: false,
  },
  youtube_shorts_9x16: {
    label: "YouTube Shorts (9:16)",
    networkLabel: "YouTube",
    network: "youtube",
    width: 1080,
    height: 1920,
    minWidth: 720,
    verified: false,
    sourceUrl: "https://support.google.com/youtube/answer/10059070",
    note: "Unverified: not read first-hand. 9:16 is the Shorts canvas.",
    safeZone: { top: 0.1, bottom: 0.3, left: 0.06, right: 0.14 },
    safeZoneVerified: false,
    safeZoneNote: "Unverified. The Shorts overlay carries a title block at the bottom and an action rail on the right.",
    durationSeconds: { min: 1, max: 180 },
    soundOn: true,
  },
};

export const isPlacement = (v: string): v is Placement => (PLACEMENTS as readonly string[]).includes(v);

export const specFor = (p: Placement): CanvasSpec => CANVAS_SPECS[p];

/** Placements sharing a network, so a channel can offer only what it can run. */
export const placementsForNetwork = (network: string): Placement[] =>
  PLACEMENTS.filter((p) => CANVAS_SPECS[p].network === network);

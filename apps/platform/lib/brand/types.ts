/*
 * The brand kit: everything a post, an ad, or a report needs to sound and look
 * like this workspace's brand. Stored as JSON on `workspace.settings.brandKit`
 * — it is configuration a person writes, never anything the product infers.
 *
 * Every field is optional by construction: an empty kit must render, save, and
 * generate exactly as the product did before the kit existed.
 */
import type { BrandVoice } from "@/lib/ai/brand-voice";

export type LinkRef = { label: string; url: string };

export type Identity = {
  legalName: string;
  displayName: string;
  oneLiner: string;
  category: string;
  locations: string[];
  languages: string[];
  website: string;
  links: LinkRef[];
};

/** Voice attributes beyond tone/audience/do/don't, which live in `BrandVoice`. */
export type VoiceRules = {
  bannedWords: string[];
  emoji: "" | "none" | "sparing" | "freely";
  spelling: "" | "us" | "uk";
  readingLevel: string;
  ctaStyle: string;
};

export const LOGO_ROLES = ["primary", "horizontal", "stacked", "mark", "wordmark", "mono_dark", "mono_light", "favicon"] as const;
export type LogoRole = (typeof LOGO_ROLES)[number];

export type Logo = { role: LogoRole; key: string; mimeType: string; bytes: number; note: string };

export const SWATCH_ROLES = ["primary", "secondary", "accent", "neutral", "surface", "text"] as const;
export type SwatchRole = (typeof SWATCH_ROLES)[number];

export type Swatch = { name: string; hex: string; role: SwatchRole; note: string };

export type Typography = { headingFamily: string; bodyFamily: string; weights: string; licenceNote: string };

export type Imagery = { style: string; doList: string[]; dontList: string[]; avoid: string[] };

export type Visual = {
  logos: Logo[];
  clearSpace: string;
  minSize: string;
  palette: Swatch[];
  typography: Typography;
  imagery: Imagery;
};

export type Offer = { name: string; detail: string; expiresAt: string };
export type Faq = { question: string; answer: string };

export type Messaging = {
  boilerplate: string;
  taglines: string[];
  valueProps: string[];
  proofPoints: string[];
  offers: Offer[];
  faqs: Faq[];
};

export type Audience = { name: string; description: string; pains: string[]; words: string[]; channels: string[] };

export type Disclaimer = { text: string; appliesTo: string };

export type Rules = {
  disclaimers: Disclaimer[];
  claimRules: string[];
  competitorPolicy: "" | "never" | "no_names" | "allowed";
  regulatedNote: string;
  approvalTriggers: string[];
};

export type ChannelPresence = { network: string; handle: string; bio: string; linkInBio: string; notes: string };

/** Library assets kept as brand assets, plus references to media that lives elsewhere. */
export type BrandAssets = { assetIds: string[]; links: LinkRef[] };

export type BrandKit = {
  identity: Identity;
  voice: BrandVoice;
  voiceRules: VoiceRules;
  visual: Visual;
  messaging: Messaging;
  audiences: Audience[];
  rules: Rules;
  channels: ChannelPresence[];
  assets: BrandAssets;
};

export const BRAND_LIMITS = {
  short: 120,
  line: 200,
  long: 2_000,
  note: 300,
  items: 12,
  audiences: 6,
  offers: 8,
  faqs: 12,
  swatches: 12,
  links: 12,
  assets: 60,
} as const;

export const LOGO_LABEL: Record<LogoRole, string> = {
  primary: "Primary",
  horizontal: "Horizontal",
  stacked: "Stacked",
  mark: "Mark only",
  wordmark: "Wordmark",
  mono_dark: "Mono on dark",
  mono_light: "Mono on light",
  favicon: "Favicon / avatar",
};

export const SWATCH_LABEL: Record<SwatchRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  neutral: "Neutral",
  surface: "Surface",
  text: "Text",
};

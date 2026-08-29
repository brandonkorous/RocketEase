/*
 * One zod schema per brand-kit section. The save action looks the section up
 * here, so adding a section never means touching authorization or auditing.
 */
import { z } from "zod";
import { brandVoiceSchema } from "@/lib/ai/brand-voice";
import { BRAND_LIMITS as L, LOGO_ROLES, SWATCH_ROLES } from "./types";

const text = (max: number) => z.string().trim().max(max).default("");
const lines = (max: number = L.items, each: number = L.line) => z.array(z.string().trim().max(each)).max(max).default([]);
const url = z.union([z.literal(""), z.string().trim().url().max(L.line)]).default("");
const linkRefs = z.array(z.object({ label: text(L.short), url })).max(L.links).default([]);

export const identitySchema = z.object({
  legalName: text(L.short),
  displayName: text(L.short),
  oneLiner: text(L.line),
  category: text(L.short),
  locations: lines(L.items, L.short),
  languages: lines(L.items, L.short),
  website: url,
  links: linkRefs,
});

export const voiceSchema = brandVoiceSchema.extend({
  bannedWords: lines(L.items, L.short),
  emoji: z.enum(["", "none", "sparing", "freely"]).default(""),
  spelling: z.enum(["", "us", "uk"]).default(""),
  readingLevel: text(L.short),
  ctaStyle: text(L.line),
});

const hex = z.string().trim().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Use a hex colour like #1a1a1a.");

export const visualSchema = z.object({
  clearSpace: text(L.note),
  minSize: text(L.note),
  palette: z.array(z.object({ name: text(L.short), hex, role: z.enum(SWATCH_ROLES), note: text(L.note) })).max(L.swatches).default([]),
  typography: z.object({ headingFamily: text(L.short), bodyFamily: text(L.short), weights: text(L.short), licenceNote: text(L.note) }).default({ headingFamily: "", bodyFamily: "", weights: "", licenceNote: "" }),
  imagery: z.object({ style: text(L.long), doList: lines(), dontList: lines(), avoid: lines() }).default({ style: "", doList: [], dontList: [], avoid: [] }),
});

export const messagingSchema = z.object({
  boilerplate: text(L.long),
  taglines: lines(),
  valueProps: lines(),
  proofPoints: lines(),
  offers: z.array(z.object({ name: text(L.short), detail: text(L.line), expiresAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default("") })).max(L.offers).default([]),
  faqs: z.array(z.object({ question: text(L.line), answer: text(L.long) })).max(L.faqs).default([]),
});

export const audiencesSchema = z.object({
  audiences: z.array(z.object({ name: text(L.short), description: text(L.long), pains: lines(), words: lines(L.items, L.short), channels: lines(L.items, L.short) })).max(L.audiences).default([]),
});

export const rulesSchema = z.object({
  disclaimers: z.array(z.object({ text: text(L.line), appliesTo: text(L.short) })).max(L.items).default([]),
  claimRules: lines(),
  competitorPolicy: z.enum(["", "never", "no_names", "allowed"]).default(""),
  regulatedNote: text(L.long),
  approvalTriggers: lines(),
});

export const channelsSchema = z.object({
  channels: z.array(z.object({ network: z.string().trim().min(1).max(40), handle: text(L.short), bio: text(L.long), linkInBio: url, notes: text(L.note) })).max(L.items).default([]),
});

export const assetsSchema = z.object({
  assetIds: z.array(z.string().trim().min(1).max(64)).max(L.assets).default([]),
  links: linkRefs,
});

export const logoSchema = z.object({ role: z.enum(LOGO_ROLES), note: text(L.note) });

export const SECTION_SCHEMAS = {
  identity: identitySchema,
  voice: voiceSchema,
  visual: visualSchema,
  messaging: messagingSchema,
  audiences: audiencesSchema,
  rules: rulesSchema,
  channels: channelsSchema,
  assets: assetsSchema,
} as const;

export type BrandSection = keyof typeof SECTION_SCHEMAS;
export type SectionInput<S extends BrandSection> = z.input<(typeof SECTION_SCHEMAS)[S]>;

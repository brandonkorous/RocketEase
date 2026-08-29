/*
 * Tolerant read of `workspace.settings.brandKit`. A hand-edited, older, or
 * partly-written blob must never break a screen or a draft, so every field is
 * coerced and clamped here rather than trusted.
 */
import { EMPTY_BRAND_VOICE, readBrandVoice } from "@/lib/ai/brand-voice";
import {
  BRAND_LIMITS as L,
  LOGO_ROLES,
  SWATCH_ROLES,
  type Audience,
  type BrandAssets,
  type BrandKit,
  type ChannelPresence,
  type Identity,
  type LinkRef,
  type Logo,
  type Messaging,
  type Rules,
  type Swatch,
  type Visual,
  type VoiceRules,
} from "./types";

type Blob = Record<string, unknown>;

const obj = (v: unknown): Blob => (v && typeof v === "object" && !Array.isArray(v) ? (v as Blob) : {});
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, each: number = L.line): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, each)).slice(0, max) : [];
const rows = (v: unknown, max: number): Blob[] => (Array.isArray(v) ? v.slice(0, max).map(obj) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | "" => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : "");

/** #rgb or #rrggbb only — a swatch is rendered as an inline colour, so it is validated, never trusted. */
export const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

const links = (v: unknown): LinkRef[] =>
  rows(v, L.links)
    .map((r) => ({ label: str(r.label, L.short), url: str(r.url, L.line) }))
    .filter((r) => r.url.length > 0);

export const EMPTY_IDENTITY: Identity = { legalName: "", displayName: "", oneLiner: "", category: "", locations: [], languages: [], website: "", links: [] };
export const EMPTY_VOICE_RULES: VoiceRules = { bannedWords: [], emoji: "", spelling: "", readingLevel: "", ctaStyle: "" };
export const EMPTY_VISUAL: Visual = {
  logos: [],
  clearSpace: "",
  minSize: "",
  palette: [],
  typography: { headingFamily: "", bodyFamily: "", weights: "", licenceNote: "" },
  imagery: { style: "", doList: [], dontList: [], avoid: [] },
};
export const EMPTY_MESSAGING: Messaging = { boilerplate: "", taglines: [], valueProps: [], proofPoints: [], offers: [], faqs: [] };
export const EMPTY_RULES: Rules = { disclaimers: [], claimRules: [], competitorPolicy: "", regulatedNote: "", approvalTriggers: [] };
export const EMPTY_ASSETS: BrandAssets = { assetIds: [], links: [] };

export const EMPTY_KIT: BrandKit = {
  identity: EMPTY_IDENTITY,
  voice: EMPTY_BRAND_VOICE,
  voiceRules: EMPTY_VOICE_RULES,
  visual: EMPTY_VISUAL,
  messaging: EMPTY_MESSAGING,
  audiences: [],
  rules: EMPTY_RULES,
  channels: [],
  assets: EMPTY_ASSETS,
};

function identity(v: unknown): Identity {
  const r = obj(v);
  return {
    legalName: str(r.legalName, L.short),
    displayName: str(r.displayName, L.short),
    oneLiner: str(r.oneLiner, L.line),
    category: str(r.category, L.short),
    locations: list(r.locations, L.items, L.short),
    languages: list(r.languages, L.items, L.short),
    website: str(r.website, L.line),
    links: links(r.links),
  };
}

function voiceRules(v: unknown): VoiceRules {
  const r = obj(v);
  return {
    bannedWords: list(r.bannedWords, L.items, L.short),
    emoji: oneOf(r.emoji, ["none", "sparing", "freely"] as const),
    spelling: oneOf(r.spelling, ["us", "uk"] as const),
    readingLevel: str(r.readingLevel, L.short),
    ctaStyle: str(r.ctaStyle, L.line),
  };
}

function visual(v: unknown): Visual {
  const r = obj(v);
  const t = obj(r.typography);
  const i = obj(r.imagery);
  return {
    logos: rows(r.logos, LOGO_ROLES.length)
      .map((g) => ({ role: oneOf(g.role, LOGO_ROLES), key: str(g.key, 400), mimeType: str(g.mimeType, 80), bytes: typeof g.bytes === "number" ? g.bytes : 0, note: str(g.note, L.note) }))
      .filter((g): g is Logo => g.role !== "" && g.key.length > 0),
    clearSpace: str(r.clearSpace, L.note),
    minSize: str(r.minSize, L.note),
    palette: rows(r.palette, L.swatches)
      .map((s) => ({ name: str(s.name, L.short), hex: str(s.hex, 9).toLowerCase(), role: oneOf(s.role, SWATCH_ROLES) || "primary", note: str(s.note, L.note) }))
      .filter((s): s is Swatch => isHex(s.hex)),
    typography: { headingFamily: str(t.headingFamily, L.short), bodyFamily: str(t.bodyFamily, L.short), weights: str(t.weights, L.short), licenceNote: str(t.licenceNote, L.note) },
    imagery: { style: str(i.style, L.long), doList: list(i.doList, L.items), dontList: list(i.dontList, L.items), avoid: list(i.avoid, L.items) },
  };
}

function messaging(v: unknown): Messaging {
  const r = obj(v);
  return {
    boilerplate: str(r.boilerplate, L.long),
    taglines: list(r.taglines, L.items),
    valueProps: list(r.valueProps, L.items),
    proofPoints: list(r.proofPoints, L.items),
    offers: rows(r.offers, L.offers)
      .map((o) => ({ name: str(o.name, L.short), detail: str(o.detail, L.line), expiresAt: str(o.expiresAt, 10) }))
      .filter((o) => o.name.length > 0),
    faqs: rows(r.faqs, L.faqs)
      .map((f) => ({ question: str(f.question, L.line), answer: str(f.answer, L.long) }))
      .filter((f) => f.question.length > 0),
  };
}

function audiences(v: unknown): Audience[] {
  return rows(v, L.audiences)
    .map((a) => ({ name: str(a.name, L.short), description: str(a.description, L.long), pains: list(a.pains, L.items), words: list(a.words, L.items, L.short), channels: list(a.channels, L.items, L.short) }))
    .filter((a) => a.name.length > 0);
}

function rules(v: unknown): Rules {
  const r = obj(v);
  return {
    disclaimers: rows(r.disclaimers, L.items)
      .map((d) => ({ text: str(d.text, L.line), appliesTo: str(d.appliesTo, L.short) }))
      .filter((d) => d.text.length > 0),
    claimRules: list(r.claimRules, L.items),
    competitorPolicy: oneOf(r.competitorPolicy, ["never", "no_names", "allowed"] as const),
    regulatedNote: str(r.regulatedNote, L.long),
    approvalTriggers: list(r.approvalTriggers, L.items),
  };
}

function channels(v: unknown): ChannelPresence[] {
  return rows(v, L.items)
    .map((c) => ({ network: str(c.network, 40), handle: str(c.handle, L.short), bio: str(c.bio, L.long), linkInBio: str(c.linkInBio, L.line), notes: str(c.notes, L.note) }))
    .filter((c) => c.network.length > 0);
}

function assets(v: unknown): BrandAssets {
  const r = obj(v);
  return { assetIds: list(r.assetIds, L.assets, 64), links: links(r.links) };
}

/** The whole kit, from the workspace settings blob. */
export function readBrandKit(settings: Record<string, unknown>): BrandKit {
  const raw = obj(settings.brandKit);
  return {
    identity: identity(raw.identity),
    voice: readBrandVoice(settings),
    voiceRules: voiceRules(raw.voiceRules),
    visual: visual(raw.visual),
    messaging: messaging(raw.messaging),
    audiences: audiences(raw.audiences),
    rules: rules(raw.rules),
    channels: channels(raw.channels),
    assets: assets(raw.assets),
  };
}

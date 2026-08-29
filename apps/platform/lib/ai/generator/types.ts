/*
 * Post & ad generator (M8.9) — the shapes the whole feature agrees on.
 *
 * Pure and client-safe: the brief form, the result cards, the prompt builders
 * and the tests all read these. Nothing here calls a model or a database.
 *
 * Product rule (positioning-2026): AI drafts, a person presses send. A Concept
 * is never a post — it becomes one only when someone clicks "Use in Create".
 */
import { z } from "zod";
import type { PublishFormat, ValidationIssue } from "@rocketease/providers/client";
import type { SyntheticFlag } from "@/db/schema/content";
import type { AdField } from "./ad-specs";

export const GOALS = ["awareness", "engagement", "traffic", "leads", "sales", "announcement"] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_LABELS: Record<Goal, string> = {
  awareness: "Awareness",
  engagement: "Engagement",
  traffic: "Traffic",
  leads: "Leads",
  sales: "Sales",
  announcement: "Announcement",
};

/** What the model is told the post should do. One line each; never invented. */
export const GOAL_INTENT: Record<Goal, string> = {
  awareness: "introduce the idea to people who have never heard of this brand",
  engagement: "invite a reply, an opinion, or a save",
  traffic: "get the reader to open the link",
  leads: "get the reader to hand over a contact detail",
  sales: "get the reader to buy the thing described",
  announcement: "state news plainly and say what changes for the reader",
};

export const MAX_CONCEPTS = 5;
export const MAX_KEY_POINTS = 8;

/** Everything the person typed. `offer` is only ever their words — never the model's. */
export type Brief = {
  goal: Goal;
  topic: string;
  keyPoints: string[];
  audience?: string;
  offer?: string;
  /** Overrides the workspace brand voice tone for this run only. */
  tone?: string;
  channels: string[];
  count: number;
  includeAds: boolean;
  language?: string;
};

export const briefSchema = z.object({
  goal: z.enum(GOALS),
  topic: z.string().trim().min(3).max(300),
  keyPoints: z.array(z.string().trim().min(1).max(300)).max(MAX_KEY_POINTS).default([]),
  audience: z.string().trim().max(300).optional(),
  offer: z.string().trim().max(300).optional(),
  tone: z.string().trim().max(240).optional(),
  channels: z.array(z.string().min(1)).min(1).max(10),
  count: z.coerce.number().int().min(1).max(MAX_CONCEPTS),
  includeAds: z.boolean().default(false),
  language: z.string().trim().max(60).optional(),
});

/** What we suggest the author declare. Deterministic — the model never decides this. */
export type DisclosureSuggestion = {
  flag: SyntheticFlag;
  /** Plain sentence for the card: what will happen on this channel. */
  detail: string;
  /** True when the network needs the line inside the caption itself. */
  inCaption: boolean;
};

export type Concept = {
  id: string;
  channelId: string;
  /** Suggested from the channel's own declared formats, never assumed. */
  format: PublishFormat;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  firstComment?: string;
  altText?: string;
  disclosure: DisclosureSuggestion;
  /** One line: why this angle. Shown so a person can judge it quickly. */
  rationale: string;
  validation: ValidationIssue[];
};

export const AD_CTAS = ["learn_more", "shop_now", "sign_up", "get_offer", "book_now", "contact_us", "download", "subscribe", "apply_now", "none"] as const;
export type AdCta = (typeof AD_CTAS)[number];

export const AD_CTA_LABELS: Record<AdCta, string> = {
  learn_more: "Learn more",
  shop_now: "Shop now",
  sign_up: "Sign up",
  get_offer: "Get offer",
  book_now: "Book now",
  contact_us: "Contact us",
  download: "Download",
  subscribe: "Subscribe",
  apply_now: "Apply now",
  none: "No button",
};

export type AdIssue = { severity: "error" | "warning"; field: AdField; message: string };

export type AdVariant = {
  id: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: AdCta;
  validation: AdIssue[];
};

export type AdSet = { channelId: string; network: string; networkLabel: string; variants: AdVariant[] };

/** One run's output. Partial success is normal: a channel can fail on its own. */
export type GeneratorResult = {
  concepts: Concept[];
  adSets: AdSet[];
  /** Only set when there is nothing at all to show. */
  error?: string;
  /** Honest per-channel notes ("LinkedIn came back unparseable"). */
  notes: string[];
};

/**
 * What the browser may post back for "Use in Create". Only the fields a person
 * can edit on the card — validation and disclosure are recomputed server-side.
 */
export const conceptWireSchema = z.object({
  channelId: z.string().min(1),
  hook: z.string().trim().max(600).default(""),
  body: z.string().trim().max(8_000).default(""),
  cta: z.string().trim().max(300).default(""),
  hashtags: z.array(z.string().trim().max(80)).max(30).default([]),
  firstComment: z.string().trim().max(2_000).optional(),
  altText: z.string().trim().max(1_000).optional(),
  syntheticMedia: z.boolean().default(false),
});
export type ConceptWire = z.infer<typeof conceptWireSchema>;

/** Assembled copy as it would read in the post. */
export function conceptText(c: Pick<Concept, "hook" | "body" | "cta" | "hashtags">): string {
  const tags = c.hashtags.length ? c.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ") : "";
  return [c.hook, c.body, c.cta, tags].map((p) => p?.trim()).filter(Boolean).join("\n\n");
}

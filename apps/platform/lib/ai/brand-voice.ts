/*
 * Brand voice (M8.8). Stored in `workspace.settings.brandKit.voice` so it needs
 * no schema of its own; it only ever shapes a draft a person still edits and
 * sends. The rest of the brand kit lives beside it in `lib/brand`.
 */
import { z } from "zod";

export type BrandVoice = {
  tone: string;
  audience: string;
  doList: string[];
  dontList: string[];
  examples: string[];
};

export const EMPTY_BRAND_VOICE: BrandVoice = { tone: "", audience: "", doList: [], dontList: [], examples: [] };

export const BRAND_VOICE_LIMITS = { tone: 240, audience: 240, item: 160, items: 10, example: 600, examples: 3 } as const;

const line = z.string().trim().max(BRAND_VOICE_LIMITS.item);
export const brandVoiceSchema = z.object({
  tone: z.string().trim().max(BRAND_VOICE_LIMITS.tone).default(""),
  audience: z.string().trim().max(BRAND_VOICE_LIMITS.audience).default(""),
  doList: z.array(line).max(BRAND_VOICE_LIMITS.items).default([]),
  dontList: z.array(line).max(BRAND_VOICE_LIMITS.items).default([]),
  examples: z.array(z.string().trim().max(BRAND_VOICE_LIMITS.example)).max(BRAND_VOICE_LIMITS.examples).default([]),
});

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()).slice(0, max) : [];

/**
 * Tolerant read: an older or hand-edited settings blob must never break a
 * screen. Voice moved into the brand kit (`settings.brandKit.voice`); the
 * legacy `settings.brandVoice` key is still read for workspaces written before
 * the move and is dropped the next time voice is saved.
 */
export function readBrandVoice(settings: Record<string, unknown>): BrandVoice {
  const kit = (settings.brandKit ?? {}) as Record<string, unknown>;
  const raw = ((kit.voice as Record<string, unknown> | undefined) ?? settings.brandVoice ?? {}) as Record<string, unknown>;
  return {
    tone: typeof raw.tone === "string" ? raw.tone.trim() : "",
    audience: typeof raw.audience === "string" ? raw.audience.trim() : "",
    doList: strings(raw.doList, BRAND_VOICE_LIMITS.items),
    dontList: strings(raw.dontList, BRAND_VOICE_LIMITS.items),
    examples: strings(raw.examples, BRAND_VOICE_LIMITS.examples),
  };
}

export function brandVoiceIsEmpty(v: BrandVoice): boolean {
  return !v.tone && !v.audience && !v.doList.length && !v.dontList.length && !v.examples.length;
}

/** The prompt fragment. Empty string when nothing is configured — never invented. */
export function brandVoicePrompt(v: BrandVoice): string {
  if (brandVoiceIsEmpty(v)) return "";
  const parts = ["Brand voice for this workspace:"];
  if (v.tone) parts.push(`- Tone: ${v.tone}`);
  if (v.audience) parts.push(`- Audience: ${v.audience}`);
  if (v.doList.length) parts.push(`- Do: ${v.doList.join("; ")}`);
  if (v.dontList.length) parts.push(`- Don't: ${v.dontList.join("; ")}`);
  if (v.examples.length) parts.push(`- Past posts that sound right (imitate the voice, not the facts):\n${v.examples.map((e) => `  """${e}"""`).join("\n")}`);
  return parts.join("\n");
}

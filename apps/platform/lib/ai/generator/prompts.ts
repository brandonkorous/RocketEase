/*
 * Generator prompt builders. Pure: no model, no database, no I/O — so every
 * rule below is inspectable and testable on its own (prompts.test.ts).
 *
 * The model is asked for JSON because the UI edits fields, not paragraphs.
 */
import { brandVoicePrompt, type BrandVoice } from "../brand-voice";
import { SAFETY_RULES, type DraftTarget, type Prompt } from "../prompts";
import type { AdSpec } from "./ad-specs";
import { AD_CTAS, GOAL_INTENT, type Brief } from "./types";

/** A channel a concept is written for, reduced to what shapes the copy. */
export type GeneratorTarget = DraftTarget & {
  formats: string[];
  firstComment: boolean;
  altText: boolean;
  links: string;
};

/** Extra rules the generator needs on top of the shared drafting rules. */
export const GENERATOR_RULES = [
  "The brief is the only source of facts. If the brief does not say it, it does not go in the post — no prices, no percentages, no dates, no customer counts, no awards, no partner names.",
  "Only mention an offer or a discount if the brief's Offer field contains one, and then use the brief's own wording.",
  "Make no claim about what the product does beyond what the brief states. If the brief is thin, write a thinner post rather than a fuller one.",
  "Write for one channel at a time. Respect that channel's limits exactly.",
  "Give each concept a genuinely different angle. Two concepts that differ only in wording are one concept.",
  "The rationale is one short sentence explaining the angle. It is for the marketer, not the reader — never put it in the post.",
].map((r) => `- ${r}`).join("\n");

const JSON_RULES = "Return JSON and nothing else: no prose before or after, no markdown fence, no comments. Every string must be plain text.";

function system(voice: BrandVoice, task: string, toneOverride?: string): string {
  const tone = toneOverride ? `For this run the marketer asked for this tone, which overrides the brand voice tone: ${toneOverride}` : "";
  return [
    `You draft social posts and ad copy for a marketing team inside Make It Social. ${task}`,
    "Rules:",
    SAFETY_RULES,
    GENERATOR_RULES,
    brandVoicePrompt(voice),
    tone,
    JSON_RULES,
  ].filter(Boolean).join("\n\n");
}

/** The brief as the model sees it. Empty fields are omitted, never filled in. */
export function briefBlock(brief: Brief): string {
  const parts = [`Goal: ${brief.goal} — the post should ${GOAL_INTENT[brief.goal]}.`, `Topic: ${brief.topic}`];
  if (brief.keyPoints.length) parts.push(`Key points (use these, add nothing):\n${brief.keyPoints.map((p) => `- ${p}`).join("\n")}`);
  if (brief.audience) parts.push(`Audience: ${brief.audience}`);
  if (brief.offer) parts.push(`Offer, in the marketer's own words (quote it, do not embellish): ${brief.offer}`);
  else parts.push("Offer: none. Do not mention a discount, promotion, price, or deadline.");
  if (brief.language) parts.push(`Write in: ${brief.language}`);
  return parts.join("\n");
}

function targetBlock(t: GeneratorTarget): string {
  const parts = [`Channel: ${t.networkLabel} — "${t.channelName}"`, `Formats this channel actually accepts: ${t.formats.join(", ") || "text"}`];
  if (t.textMax !== undefined) parts.push(`Hard limit: ${t.textMax} characters for hook + body + call to action + hashtags combined.`);
  if (t.hashtagsMax !== undefined) parts.push(`At most ${t.hashtagsMax} hashtags.`);
  else parts.push("Keep hashtags to a handful.");
  parts.push(t.firstComment ? "This channel supports a first comment; use it for hashtags or a link if that suits." : "This channel has no first comment — leave firstComment empty.");
  parts.push(t.altText ? "Suggest alt text describing the image the marketer would pair with this." : "This channel has no alt text field — leave altText empty.");
  if (t.links === "none") parts.push("Links are not clickable here. Never write “link in the caption”.");
  return parts.join("\n");
}

const CONCEPT_SHAPE = `{"concepts":[{"format":"one of the accepted formats","hook":"first line that earns the next line","body":"the middle of the post","cta":"one short call to action","hashtags":["NoHash","JustWords"],"firstComment":"","altText":"","rationale":"one sentence on why this angle"}]}`;

/** N distinct concepts for one channel. `avoid` powers Regenerate. */
export function conceptPrompt(input: { target: GeneratorTarget; brief: Brief; voice: BrandVoice; avoid?: string[] }): Prompt {
  const count = Math.max(1, input.brief.count);
  const avoid = input.avoid?.length
    ? `Do not repeat these angles, which the marketer has already seen:\n${input.avoid.map((a) => `- ${a}`).join("\n")}`
    : "";
  return {
    system: system(input.voice, "You propose post concepts a marketer will edit before publishing.", input.brief.tone),
    user: [
      `Write ${count} post concept${count === 1 ? "" : "s"} for this one channel.`,
      targetBlock(input.target),
      briefBlock(input.brief),
      avoid,
      `Return exactly this shape with ${count} item${count === 1 ? "" : "s"}:`,
      CONCEPT_SHAPE,
    ].filter(Boolean).join("\n\n"),
    maxTokens: 700 + count * 500,
  };
}

/**
 * One shortening pass for copy that came back over a channel's limit. We ask
 * the model to cut rather than truncating: a sentence sliced mid-word is worse
 * than no draft at all.
 */
export function shortenPrompt(input: { target: GeneratorTarget; hook: string; body: string; cta: string; hashtags: string[]; over: number }): Prompt {
  return {
    system: "You shorten social copy without changing what it says. Remove words, never facts. Return JSON only.",
    user: [
      `This post is ${input.over} characters too long for ${input.target.networkLabel}${input.target.textMax !== undefined ? ` (limit ${input.target.textMax} characters for everything combined)` : ""}.`,
      "Cut it down. Keep every concrete fact, keep the call to action, drop adjectives and repetition first. Add nothing new.",
      `Current copy:\n${JSON.stringify({ hook: input.hook, body: input.body, cta: input.cta, hashtags: input.hashtags })}`,
      `Return: {"hook":"","body":"","cta":"","hashtags":[]}`,
    ].join("\n\n"),
    maxTokens: 900,
  };
}

function adFieldBlock(spec: AdSpec): string {
  return (["primaryText", "headline", "description"] as const)
    .map((f) => {
      const s = spec.fields[f];
      if (s.unavailable) return `- ${f} (${s.label}): not used on ${spec.networkLabel}. Return an empty string.`;
      const limit = s.max !== undefined ? `at most ${s.max} characters` : s.recommended !== undefined ? `aim for ${s.recommended} characters or fewer` : "keep it short";
      return `- ${f} (${s.label}): ${limit}.`;
    })
    .join("\n");
}

const AD_SHAPE = `{"variants":[{"primaryText":"","headline":"","description":"","cta":"one of the allowed values"}]}`;

/** Ad variants for one ad-capable channel, bounded by that network's real fields. */
export function adPrompt(input: { target: GeneratorTarget; spec: AdSpec; brief: Brief; voice: BrandVoice; count?: number }): Prompt {
  const count = input.count ?? 3;
  return {
    system: system(input.voice, "You write paid ad copy a marketer will review, edit, and decide whether to spend money on.", input.brief.tone),
    user: [
      `Write ${count} ad copy variants for ${input.spec.networkLabel} (${input.spec.placement}).`,
      `Fields on this placement:\n${adFieldBlock(input.spec)}`,
      `cta must be exactly one of: ${AD_CTAS.join(", ")}. Pick "none" if no button fits.`,
      "Ad copy is held to the same rules as organic: no invented proof, no invented urgency, no price or discount unless the brief states one.",
      briefBlock(input.brief),
      "Return exactly this shape:",
      AD_SHAPE,
    ].join("\n\n"),
    maxTokens: 500 + count * 300,
  };
}

/** Second attempt after an unparseable response: same task, blunter instruction. */
export function repairPrompt(original: Prompt): Prompt {
  return {
    ...original,
    user: `${original.user}\n\nYour previous answer could not be parsed as JSON. Reply with the JSON object only — first character "{", last character "}".`,
  };
}

/*
 * Prompt builders (M8.8). Nothing here calls a model or touches the database —
 * the whole point is that a prompt is inspectable and testable on its own.
 *
 * Product rule: the model drafts, a person edits and presses send.
 */
import type { BrandVoice } from "./brand-voice";
import { brandVoicePrompt } from "./brand-voice";

/** One place a draft can go: a real connected channel with its real limits. */
export type DraftTarget = {
  channelId: string;
  network: string;
  networkLabel: string;
  channelName: string;
  textMax?: number;
  hashtagsMax?: number;
};

export const SAFETY_RULES = [
  "Never invent facts, statistics, prices, discounts, offers, dates, availability, or customer quotes. If a detail is not in the material you were given, leave it out or write a clearly marked placeholder like [add price].",
  "Never claim a partnership, award, review, or result that is not stated in the material.",
  "Be honest about what the post is: if the material says it is an ad, a paid partnership, or sponsored, keep that disclosure in the text.",
  "Write plain language. No hype, no filler, no emoji unless the brand voice asks for them.",
  "You are drafting for a person who will edit this and decide whether to send it. Do not address the reader as if the post is already published.",
].map((r) => `- ${r}`).join("\n");

const OUTPUT_RULES = "Return only the drafts themselves, nothing else — no preamble, no numbering, no explanation, no quotation marks around them. Separate each draft with a line containing only ---";

function limits(t: DraftTarget): string {
  const parts = [`Network: ${t.networkLabel} (channel "${t.channelName}")`];
  if (t.textMax !== undefined) parts.push(`Hard limit: ${t.textMax} characters including spaces. Stay under it.`);
  if (t.hashtagsMax !== undefined) parts.push(`At most ${t.hashtagsMax} hashtags.`);
  return parts.join("\n");
}

function system(voice: BrandVoice, task: string): string {
  const v = brandVoicePrompt(voice);
  return [`You draft social posts for a marketing team inside Make It Social. ${task}`, "Rules:", SAFETY_RULES, v, OUTPUT_RULES].filter(Boolean).join("\n\n");
}

export type Prompt = { system: string; user: string; maxTokens: number };

/** Caption variants for one channel, from the writer's own draft text. */
export function captionPrompt(input: { target: DraftTarget; text: string; voice: BrandVoice; count?: number }): Prompt {
  const count = input.count ?? 2;
  return {
    system: system(input.voice, "You rewrite a draft into alternatives the writer can pick from and edit."),
    user: [
      `Write ${count} alternative versions of the post below for this channel.`,
      limits(input.target),
      "Keep every concrete fact from the draft and add none. Vary the opening and the structure, not the meaning.",
      "The writer's draft:",
      `"""${input.text}"""`,
    ].join("\n\n"),
    maxTokens: 1200,
  };
}

/** Long-form source (a blog post, transcript, release note) → one channel's short post. */
export function repurposePrompt(input: { target: DraftTarget; sourceText: string; voice: BrandVoice; count?: number }): Prompt {
  const count = input.count ?? 2;
  return {
    system: system(input.voice, "You turn long-form material into short social posts."),
    user: [
      `Write ${count} short posts for this channel drawn from the material below.`,
      limits(input.target),
      "Use only what the material actually says. Pick the one idea that stands on its own; do not summarise everything.",
      "The material:",
      `"""${input.sourceText}"""`,
    ].join("\n\n"),
    maxTokens: 1500,
  };
}

export type ThreadTurn = { who: "customer" | "us"; text: string };

/** A reply suggestion grounded in the thread and the workspace's saved replies. */
export function replyPrompt(input: {
  voice: BrandVoice;
  networkLabel: string;
  contactName: string;
  turns: ThreadTurn[];
  savedReplies: { title: string; body: string }[];
  textMax: number;
  count?: number;
}): Prompt {
  const count = input.count ?? 2;
  const thread = input.turns.map((t) => `${t.who === "customer" ? input.contactName : "Us"}: ${t.text}`).join("\n");
  const saved = input.savedReplies.length
    ? ["Approved saved replies for this workspace. If one of them answers the question, adapt it rather than writing something new:", ...input.savedReplies.map((r) => `- ${r.title}: ${r.body}`)].join("\n")
    : "";
  return {
    system: system(input.voice, "You draft replies to customers for a support and social team."),
    user: [
      `Write ${count} possible replies to the customer's latest message on ${input.networkLabel}.`,
      `Hard limit: ${input.textMax} characters each.`,
      "Answer only what the thread and the saved replies support. If the answer is not there, write a reply that asks for the missing detail or promises a follow-up — never guess an answer, a refund, a delivery date, or a price.",
      saved,
      "The conversation so far:",
      `"""\n${thread}\n"""`,
    ].filter(Boolean).join("\n\n"),
    maxTokens: 1000,
  };
}

const SEPARATOR = /\r?\n[ \t]*[-=*_]{3,}[ \t]*(?:\r?\n|$)/;
const LABEL = /^\s*(?:\*{0,2})(?:option|variant|version|draft|reply|post)\s*#?\d*\s*[:.)-]?\s*(?:\*{0,2})\s*/i;
const NUMBER = /^\s*\d+[.)]\s+/;

/** Splits a model response into drafts and strips the labels models like to add. */
export function parseVariants(raw: string, max = 4): string[] {
  return raw
    .split(SEPARATOR)
    .map((part) => part.replace(LABEL, "").replace(NUMBER, "").trim())
    .map((part) => (part.startsWith('"') && part.endsWith('"') && part.length > 1 ? part.slice(1, -1).trim() : part))
    .filter((part) => part.length > 0)
    .slice(0, max);
}

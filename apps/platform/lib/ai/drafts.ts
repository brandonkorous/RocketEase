/*
 * Draft orchestration (M8.8). Pure: the generator is injected, so this module
 * is testable without the SDK. Nothing here writes, saves, schedules, or sends.
 */
import { validateAgainstCapabilities, type Capabilities } from "@rocketease/providers/client";
import type { BrandVoice } from "./brand-voice";
import { captionPrompt, parseVariants, repurposePrompt, replyPrompt, type DraftTarget, type Prompt, type ThreadTurn } from "./prompts";

export type DraftChannel = DraftTarget & { capabilities: Capabilities };
export type DraftVariant = { id: string; channelId: string; label: string; text: string; note?: string };
export type DraftOutcome = { variants: DraftVariant[]; error?: string };
/** What a server action hands the UI: variants to edit, or a reason there are none. */
export type AiDraftState = { variants?: DraftVariant[]; error?: string };
export type Generator = (prompt: Prompt) => Promise<{ text: string } | { error: string }>;

const NOTHING = "The model didn't return anything usable. Try again.";

/**
 * The channel's own capabilities decide whether a draft fits — we surface the
 * mismatch instead of truncating, because a person edits this before it ships.
 */
function noteFor(ch: DraftChannel, text: string): string | undefined {
  const format = ch.capabilities.formats[0] ?? "text";
  const issues = validateAgainstCapabilities(ch.capabilities, { format, text, media: [] });
  const relevant = issues.filter((i) => i.field === "text");
  return relevant.length ? relevant.map((i) => i.message).join(" ") : undefined;
}

async function draftsFor(ch: DraftChannel, prompt: Prompt, gen: Generator, max: number): Promise<{ variants: DraftVariant[]; error?: string }> {
  const res = await gen(prompt);
  if ("error" in res) return { variants: [], error: res.error };
  const parsed = parseVariants(res.text, max);
  if (!parsed.length) return { variants: [], error: NOTHING };
  return {
    variants: parsed.map((text, i) => ({
      id: `${ch.channelId}:${i}`,
      channelId: ch.channelId,
      label: parsed.length > 1 ? `${ch.networkLabel} · ${ch.channelName} (${i + 1})` : `${ch.networkLabel} · ${ch.channelName}`,
      text,
      note: noteFor(ch, text),
    })),
  };
}

/** Merges per-channel results: partial success wins, an all-failure reports the first error. */
function merge(results: { variants: DraftVariant[]; error?: string }[]): DraftOutcome {
  const variants = results.flatMap((r) => r.variants);
  if (variants.length) return { variants };
  return { variants: [], error: results.find((r) => r.error)?.error ?? NOTHING };
}

export async function captionDrafts(input: { channels: DraftChannel[]; text: string; voice: BrandVoice; brand?: string }, gen: Generator): Promise<DraftOutcome> {
  const results = await Promise.all(input.channels.map((ch) => draftsFor(ch, captionPrompt({ target: ch, text: input.text, voice: input.voice, brand: input.brand }), gen, 2)));
  return merge(results);
}

export async function repurposeDrafts(input: { channels: DraftChannel[]; sourceText: string; voice: BrandVoice; brand?: string }, gen: Generator): Promise<DraftOutcome> {
  const results = await Promise.all(input.channels.map((ch) => draftsFor(ch, repurposePrompt({ target: ch, sourceText: input.sourceText, voice: input.voice, brand: input.brand }), gen, 2)));
  return merge(results);
}

export type ReplyInput = {
  voice: BrandVoice;
  brand?: string;
  networkLabel: string;
  contactName: string;
  turns: ThreadTurn[];
  savedReplies: { title: string; body: string }[];
  textMax: number;
};

export async function replyDrafts(input: ReplyInput, gen: Generator): Promise<DraftOutcome> {
  const res = await gen(replyPrompt(input));
  if ("error" in res) return { variants: [], error: res.error };
  const parsed = parseVariants(res.text, 3);
  if (!parsed.length) return { variants: [], error: NOTHING };
  return {
    variants: parsed.map((text, i) => ({
      id: `reply:${i}`,
      channelId: "",
      label: `Suggestion ${i + 1}`,
      text,
      note: text.length > input.textMax ? `${text.length - input.textMax} characters over the ${input.textMax} limit.` : undefined,
    })),
  };
}

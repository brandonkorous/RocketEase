/*
 * Concepts for one channel: ask, parse, validate against the channel's real
 * capabilities, and — when the copy came back over the limit — ask once for a
 * shorter version. Nothing is ever silently truncated.
 *
 * Pure apart from the injected generator, so concepts.test.ts needs no SDK.
 */
import { validateAgainstCapabilities, type Capabilities, type PublishFormat, type ValidationIssue } from "@make-it-social/providers/client";
import type { BrandVoice } from "../brand-voice";
import type { DraftChannel } from "../drafts";
import { askJson, type Generator } from "./ask";
import { parseJson, str, strList } from "./parse";
import { conceptPrompt, shortenPrompt, type GeneratorTarget } from "./prompts";
import { suggestDisclosure } from "./disclosure";
import { conceptText, type Brief, type Concept } from "./types";

/** Media is attached in Create, not here — those issues aren't the copy's fault. */
const MEDIA_PENDING = new Set(["image_required", "video_required", "alt_text_missing", "too_many_images"]);

export function targetFor(ch: DraftChannel): GeneratorTarget {
  return {
    channelId: ch.channelId,
    network: ch.network,
    networkLabel: ch.networkLabel,
    channelName: ch.channelName,
    textMax: ch.textMax,
    hashtagsMax: ch.hashtagsMax,
    formats: ch.capabilities.formats,
    firstComment: Boolean(ch.capabilities.limits.firstComment),
    altText: Boolean(ch.capabilities.limits.altText),
    links: ch.capabilities.limits.links ?? "inline",
  };
}

/** The channel decides the format: a suggestion outside its list is not honoured. */
function pickFormat(caps: Capabilities, suggested: string): PublishFormat {
  const formats = caps.formats;
  if (formats.includes(suggested as PublishFormat)) return suggested as PublishFormat;
  return formats[0] ?? "text";
}

function validate(caps: Capabilities, c: Omit<Concept, "validation">): ValidationIssue[] {
  const issues = validateAgainstCapabilities(caps, {
    format: c.format,
    text: conceptText(c),
    media: [],
    firstComment: c.firstComment || undefined,
  });
  return issues.filter((i) => !MEDIA_PENDING.has(i.code));
}

function toConcept(ch: DraftChannel, o: Record<string, unknown>, index: number, synthetic = false): Concept {
  const hashMax = ch.capabilities.limits.hashtagsMax ?? 10;
  const base = {
    id: `${ch.channelId}:${Date.now().toString(36)}:${index}`,
    channelId: ch.channelId,
    format: pickFormat(ch.capabilities, str(o, "format", 20)),
    hook: str(o, "hook", 600),
    body: str(o, "body", 4_000),
    cta: str(o, "cta", 300),
    hashtags: strList(o, "hashtags", hashMax).map((t) => t.replace(/^#+/, "")).filter(Boolean),
    firstComment: ch.capabilities.limits.firstComment ? str(o, "firstComment", 2_000) || undefined : undefined,
    altText: ch.capabilities.limits.altText ? str(o, "altText", 1_000) || undefined : undefined,
    disclosure: suggestDisclosure(ch.capabilities, synthetic),
    rationale: str(o, "rationale", 300),
  };
  return { ...base, validation: validate(ch.capabilities, base) };
}

const overBy = (c: Concept, textMax?: number) => (textMax === undefined ? 0 : Math.max(0, conceptText(c).length - textMax));

/** One shortening pass. Returns the original when the model can't do better. */
async function shorten(ch: DraftChannel, c: Concept, gen: Generator): Promise<Concept> {
  const over = overBy(c, ch.textMax);
  if (over === 0) return c;
  const res = await gen(shortenPrompt({ target: targetFor(ch), hook: c.hook, body: c.body, cta: c.cta, hashtags: c.hashtags, over }));
  if ("error" in res) return c;
  const parsed = parseJson<Record<string, unknown>>(res.text);
  if (!parsed || typeof parsed !== "object") return c;
  const next = {
    ...c,
    hook: str(parsed, "hook", 600) || c.hook,
    body: str(parsed, "body", 4_000) || c.body,
    cta: str(parsed, "cta", 300) || c.cta,
    hashtags: strList(parsed, "hashtags", c.hashtags.length || 10).map((t) => t.replace(/^#+/, "")),
  };
  const revalidated = { ...next, validation: validate(ch.capabilities, next) };
  // Keep whichever version is closer to fitting; a "shorter" answer that grew is discarded.
  return overBy(revalidated, ch.textMax) < over ? revalidated : c;
}

export type ChannelConcepts = { concepts: Concept[]; error?: string };

/** Concepts for one channel, already validated and length-corrected. */
export async function conceptsForChannel(
  ch: DraftChannel,
  input: { brief: Brief; voice: BrandVoice; avoid?: string[] },
  gen: Generator,
): Promise<ChannelConcepts> {
  const prompt = conceptPrompt({ target: targetFor(ch), brief: input.brief, voice: input.voice, avoid: input.avoid });
  const res = await askJson(gen, prompt, "concepts");
  if ("error" in res) return { concepts: [], error: res.error };
  const drafted = res.items.slice(0, input.brief.count).map((o, i) => toConcept(ch, o, i));
  const usable = drafted.filter((c) => c.hook || c.body);
  if (!usable.length) return { concepts: [], error: "The model returned nothing to edit. Try again." };
  return { concepts: await Promise.all(usable.map((c) => shorten(ch, c, gen))) };
}

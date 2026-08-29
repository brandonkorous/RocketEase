/*
 * One generator run: concepts for every selected channel, plus ad variants for
 * the ad-capable ones. The generator is injected, so this whole path is
 * testable without the SDK and without a database.
 *
 * Partial success is the normal case — one channel failing must not lose the
 * rest, and a failure is reported as a note rather than swallowed.
 */
import type { BrandVoice } from "../brand-voice";
import type { DraftChannel } from "../drafts";
import { adCapable, adsForChannel } from "./ads";
import type { Generator } from "./ask";
import { conceptsForChannel } from "./concepts";
import type { AdSet, Brief, Concept, GeneratorResult } from "./types";

export type { Generator } from "./ask";

const NOTHING = "Nothing came back to edit. Try again, or add a key point to the brief.";

export type RunInput = { brief: Brief; channels: DraftChannel[]; voice: BrandVoice };

/** `adGen` is separate so paid copy can be metered under its own usage kind. */
export async function runGenerator(input: RunInput, gen: Generator, adGen: Generator = gen): Promise<GeneratorResult> {
  const { brief, channels, voice } = input;
  const wantAds = brief.includeAds ? channels.filter((c) => adCapable(c.network, c.capabilities)) : [];

  const [conceptRuns, adRuns] = await Promise.all([
    Promise.all(channels.map((ch) => conceptsForChannel(ch, { brief, voice }, gen))),
    Promise.all(wantAds.map((ch) => adsForChannel(ch, { brief, voice }, adGen))),
  ]);

  const concepts: Concept[] = conceptRuns.flatMap((r) => r.concepts);
  const adSets: AdSet[] = adRuns.flatMap((r) => (r.adSet ? [r.adSet] : []));
  const notes = [
    ...conceptRuns.flatMap((r, i) => (r.error ? [`${channels[i].networkLabel}: ${r.error}`] : [])),
    ...adRuns.flatMap((r) => (r.error ? [r.error] : [])),
  ];

  if (!concepts.length && !adSets.length) return { concepts: [], adSets: [], notes, error: notes[0] ?? NOTHING };
  return { concepts, adSets, notes };
}

/** One fresh concept for one channel, told which angles the person already rejected. */
export async function runRegenerate(
  input: { brief: Brief; channel: DraftChannel; voice: BrandVoice; avoid: string[] },
  gen: Generator,
): Promise<{ concept?: Concept; error?: string }> {
  const brief = { ...input.brief, count: 1 };
  const r = await conceptsForChannel(input.channel, { brief, voice: input.voice, avoid: input.avoid }, gen);
  if (r.error || !r.concepts.length) return { error: r.error ?? NOTHING };
  return { concept: r.concepts[0] };
}

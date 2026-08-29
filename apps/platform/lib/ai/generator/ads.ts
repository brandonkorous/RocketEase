/*
 * Ad copy variants for one ad-capable channel, bounded by that network's real
 * fields (ad-specs.ts). Nothing here spends money or touches an ad account —
 * it produces copy a person reviews before any promotion is created.
 */
import type { Capabilities } from "@rocketease/providers/client";
import type { BrandVoice } from "../brand-voice";
import type { DraftChannel } from "../drafts";
import { adSpecFor, validateAdCopy, type AdSpec } from "./ad-specs";
import { askJson, type Generator } from "./ask";
import { str } from "./parse";
import { adPrompt } from "./prompts";
import { targetFor } from "./concepts";
import { AD_CTAS, type AdCta, type AdSet, type AdVariant, type Brief } from "./types";

/** A channel can carry ad copy only if we have that network's fields AND ads access. */
export function adCapable(network: string, caps: Capabilities): boolean {
  return Boolean(adSpecFor(network)) && (caps.ads.manage || caps.ads.import);
}

const cta = (raw: string): AdCta => {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (AD_CTAS as readonly string[]).includes(key) ? (key as AdCta) : "none";
};

function toVariant(spec: AdSpec, o: Record<string, unknown>, channelId: string, i: number): AdVariant {
  const copy = {
    primaryText: str(o, "primaryText", 2_000),
    headline: str(o, "headline", 500),
    description: str(o, "description", 500),
  };
  return { id: `${channelId}:ad:${i}`, ...copy, cta: cta(str(o, "cta", 40)), validation: validateAdCopy(spec, copy) };
}

export type ChannelAds = { adSet?: AdSet; error?: string };

export async function adsForChannel(ch: DraftChannel, input: { brief: Brief; voice: BrandVoice; brand?: string; count?: number }, gen: Generator): Promise<ChannelAds> {
  const spec = adSpecFor(ch.network);
  if (!spec) return {};
  const res = await askJson(gen, adPrompt({ target: targetFor(ch), spec, brief: input.brief, voice: input.voice, brand: input.brand, count: input.count }), "variants");
  if ("error" in res) return { error: `${ch.networkLabel} ad copy: ${res.error}` };
  const variants = res.items.slice(0, 4).map((o, i) => toVariant(spec, o, ch.channelId, i)).filter((v) => v.primaryText || v.headline);
  if (!variants.length) return { error: `${ch.networkLabel} ad copy came back empty.` };
  return { adSet: { channelId: ch.channelId, network: ch.network, networkLabel: ch.networkLabel, variants } };
}

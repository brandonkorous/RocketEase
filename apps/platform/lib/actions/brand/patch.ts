/*
 * Section input → the JSON patch merged into `workspace.settings.brandKit`,
 * plus the shape recorded in the audit log (counts and short values, never the
 * whole essay).
 */
import type { BrandSection } from "@/lib/brand/schema";
import type { BrandKit } from "@/lib/brand/types";

type Values = Record<string, unknown>;

/** Logos are uploaded on their own path, so a visual save must carry them through. */
function visualPatch(v: Values, before: BrandKit) {
  return { visual: { ...v, logos: before.visual.logos } };
}

export function patchFor(section: BrandSection, values: unknown, before: BrandKit): Record<string, unknown> {
  const v = values as Values;
  switch (section) {
    case "voice": {
      const { bannedWords, emoji, spelling, readingLevel, ctaStyle, ...voice } = v;
      return { voice, voiceRules: { bannedWords, emoji, spelling, readingLevel, ctaStyle } };
    }
    case "visual":
      return visualPatch(v, before);
    case "audiences":
      return { audiences: v.audiences };
    case "channels":
      return { channels: v.channels };
    default:
      return { [section]: v };
  }
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export function auditShape(section: BrandSection, kit: BrandKit): Record<string, unknown> {
  switch (section) {
    case "identity":
      return { displayName: kit.identity.displayName, oneLiner: kit.identity.oneLiner, links: len(kit.identity.links) };
    case "voice":
      return { tone: kit.voice.tone, audience: kit.voice.audience, do: len(kit.voice.doList), dont: len(kit.voice.dontList), examples: len(kit.voice.examples), banned: len(kit.voiceRules.bannedWords) };
    case "visual":
      return { logos: len(kit.visual.logos), palette: kit.visual.palette.map((s) => s.hex), fonts: [kit.visual.typography.headingFamily, kit.visual.typography.bodyFamily].filter(Boolean), imagery: Boolean(kit.visual.imagery.style) };
    case "messaging":
      return { taglines: len(kit.messaging.taglines), valueProps: len(kit.messaging.valueProps), proofPoints: len(kit.messaging.proofPoints), offers: kit.messaging.offers.map((o) => o.name), faqs: len(kit.messaging.faqs) };
    case "audiences":
      return { audiences: kit.audiences.map((a) => a.name) };
    case "rules":
      return { disclaimers: len(kit.rules.disclaimers), claimRules: len(kit.rules.claimRules), competitorPolicy: kit.rules.competitorPolicy, triggers: len(kit.rules.approvalTriggers) };
    case "channels":
      return { channels: kit.channels.map((c) => c.network) };
    case "assets":
      return { assets: len(kit.assets.assetIds), links: len(kit.assets.links) };
  }
}

/*
 * Brand completeness. Every gap names what it actually costs, because "62%"
 * on its own tells a marketer nothing about which field to fill in next.
 */
import type { BrandSection } from "./schema";
import type { BrandKit } from "./types";

export type HealthItem = { section: BrandSection; label: string; done: boolean; cost: string };
export type Health = { items: HealthItem[]; done: number; total: number; percent: number };

const item = (section: BrandSection, label: string, done: boolean, cost: string): HealthItem => ({ section, label, done, cost });

function items(kit: BrandKit): HealthItem[] {
  const { identity, voice, visual, messaging, rules } = kit;
  return [
    item("identity", "What the business does", Boolean(identity.oneLiner), "Drafts start from the brief alone, so posts read like they could be about any business."),
    item("identity", "Website or key link", Boolean(identity.website || identity.links.length), "Nothing to point a call to action at, so drafts end vaguely."),
    item("voice", "Tone and audience", Boolean(voice.tone && voice.audience), "Drafts default to generic marketing English."),
    item("voice", "Do and don't", Boolean(voice.doList.length || voice.dontList.length), "Nothing stops the model reaching for phrasing you have already rejected."),
    item("voice", "Posts that already sound right", voice.examples.length > 0, "The strongest voice signal there is — without an example, tone is only described, never shown."),
    item("visual", "Logo files", visual.logos.length > 0, "No mark to place on creative, and client reports fall back to the workspace name."),
    item("visual", "Colour palette", visual.palette.length > 0, "Generated images ignore your colours."),
    item("visual", "Typography", Boolean(visual.typography.headingFamily || visual.typography.bodyFamily), "Anyone making creative outside the product has to guess the fonts."),
    item("visual", "Photography direction", Boolean(visual.imagery.style), "Generated imagery has no house style and drifts run to run."),
    item("messaging", "Value propositions", messaging.valueProps.length > 0, "Every draft has to be told what is good about the product, in the brief, every time."),
    item("messaging", "Boilerplate", Boolean(messaging.boilerplate), "No approved description to fall back on for bios, ads, and reports."),
    item("audiences", "At least one audience", kit.audiences.length > 0, "Concepts cannot be angled at a specific reader, so they average out."),
    item("rules", "Compliance rules", rules.disclaimers.length > 0 || rules.claimRules.length > 0 || Boolean(rules.regulatedNote), "Nothing stops a draft making a claim you are not allowed to make."),
    item("assets", "Brand assets", kit.assets.assetIds.length > 0 || kit.assets.links.length > 0, "Creators hunt for logos and product shots outside the product."),
  ];
}

export function brandHealth(kit: BrandKit): Health {
  const list = items(kit);
  const done = list.filter((i) => i.done).length;
  return { items: list, done, total: list.length, percent: Math.round((done / list.length) * 100) };
}

export type BrandWarning = { section: BrandSection; text: string };

/** Things that are configured but no longer true. `today` is an ISO date in the workspace timezone. */
export function brandWarnings(kit: BrandKit, today: string): BrandWarning[] {
  const expired = kit.messaging.offers.filter((o) => o.expiresAt && o.expiresAt < today);
  const warnings: BrandWarning[] = expired.map((o) => ({ section: "messaging", text: `The offer "${o.name}" expired on ${o.expiresAt}. Drafting ignores it — remove it or give it a new date.` }));
  if (kit.visual.palette.length && !kit.visual.imagery.style) {
    warnings.push({ section: "visual", text: "A palette is set but there is no photography direction, so generated images use your colours without a house style." });
  }
  if (kit.visual.typography.headingFamily && !kit.visual.typography.licenceNote) {
    warnings.push({ section: "visual", text: "No licence note against the brand fonts. Record who may use them and where before sharing the kit with a client or a freelancer." });
  }
  return warnings;
}

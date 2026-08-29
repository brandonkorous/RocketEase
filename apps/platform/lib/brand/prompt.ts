/*
 * The brand kit as prompt text. Pure and inspectable: what the model is told
 * about a brand is exactly what a person typed on the Brand pages — nothing is
 * inferred, and an empty section contributes nothing at all.
 */
import type { BrandKit, Identity, Messaging, Rules, VoiceRules } from "./types";

const bullets = (label: string, items: string[]) => (items.length ? `${label}: ${items.join("; ")}` : "");

const EMOJI_RULE: Record<string, string> = {
  none: "Use no emoji at all.",
  sparing: "At most one emoji per post, and only when it earns its place.",
  freely: "Emoji are welcome where they help.",
};
const SPELLING_RULE: Record<string, string> = { us: "Use US spelling.", uk: "Use British spelling." };
const COMPETITOR_RULE: Record<string, string> = {
  never: "Never refer to competitors, directly or by implication.",
  no_names: "You may contrast with alternatives, but never name a competitor.",
  allowed: "Competitors may be named when the brief does so.",
};

function identityBlock(i: Identity): string {
  const parts = [
    i.displayName || i.legalName ? `- Name used in posts: ${i.displayName || i.legalName}` : "",
    i.oneLiner ? `- What the business does: ${i.oneLiner}` : "",
    i.category ? `- Category: ${i.category}` : "",
    bullets("- Locations served", i.locations),
    bullets("- Languages", i.languages),
    i.website ? `- Website: ${i.website}` : "",
    i.links.length ? `- Links that may be used: ${i.links.map((l) => `${l.label || "link"} ${l.url}`).join("; ")}` : "",
  ].filter(Boolean);
  return parts.length ? `The business:\n${parts.join("\n")}` : "";
}

/** Offers are facts with an expiry — a lapsed one must never reach a draft. */
function messagingBlock(m: Messaging, today: string): string {
  const live = m.offers.filter((o) => !o.expiresAt || o.expiresAt >= today);
  const parts = [
    m.boilerplate ? `- How the business describes itself: ${m.boilerplate}` : "",
    bullets("- Taglines (use verbatim or not at all)", m.taglines),
    bullets("- Value propositions", m.valueProps),
    bullets("- Proof points, already verified by the team", m.proofPoints),
    live.length ? `- Offers that are currently live (quote the wording, invent no others): ${live.map((o) => `${o.name} — ${o.detail}${o.expiresAt ? ` (until ${o.expiresAt})` : ""}`).join("; ")}` : "",
    m.faqs.length ? `- Questions customers ask: ${m.faqs.map((f) => `${f.question} → ${f.answer}`).join(" | ")}` : "",
  ].filter(Boolean);
  return parts.length ? `Approved messaging — these are facts the team has signed off, so they may be used even when the brief omits them:\n${parts.join("\n")}` : "";
}

function voiceRulesBlock(v: VoiceRules): string {
  const parts = [
    bullets("- Never use these words", v.bannedWords),
    v.emoji ? `- ${EMOJI_RULE[v.emoji]}` : "",
    v.spelling ? `- ${SPELLING_RULE[v.spelling]}` : "",
    v.readingLevel ? `- Reading level: ${v.readingLevel}` : "",
    v.ctaStyle ? `- How calls to action should sound: ${v.ctaStyle}` : "",
  ].filter(Boolean);
  return parts.length ? `Writing rules:\n${parts.join("\n")}` : "";
}

function rulesBlock(r: Rules): string {
  const parts = [
    r.disclaimers.length ? `- Required disclaimers: ${r.disclaimers.map((d) => `"${d.text}"${d.appliesTo ? ` (${d.appliesTo})` : ""}`).join("; ")}` : "",
    bullets("- Claims that are not allowed", r.claimRules),
    r.competitorPolicy ? `- ${COMPETITOR_RULE[r.competitorPolicy]}` : "",
    r.regulatedNote ? `- Regulatory context: ${r.regulatedNote}` : "",
  ].filter(Boolean);
  return parts.length ? `Compliance rules — these override everything else, including the brief:\n${parts.join("\n")}` : "";
}

function audienceBlock(kit: BrandKit): string {
  if (!kit.audiences.length) return "";
  const lines = kit.audiences.map((a) => {
    const bits = [a.description, a.pains.length ? `pains: ${a.pains.join(", ")}` : "", a.words.length ? `their words: ${a.words.join(", ")}` : ""].filter(Boolean);
    return `- ${a.name}${bits.length ? ` — ${bits.join("; ")}` : ""}`;
  });
  return `Who the posts are for:\n${lines.join("\n")}`;
}

/**
 * Everything the copy model is told about the brand *except* the voice, which
 * the prompt builder already adds through `brandVoicePrompt`. Empty when
 * nothing is configured.
 */
export function brandKitPrompt(kit: BrandKit, opts: { today: string }): string {
  return [identityBlock(kit.identity), voiceRulesBlock(kit.voiceRules), audienceBlock(kit), messagingBlock(kit.messaging, opts.today), rulesBlock(kit.rules)]
    .filter(Boolean)
    .join("\n\n");
}

const IMAGE_SAFETY = "Do not draw the brand's logo, wordmark, or any lettering — the logo is placed afterwards from the real file.";

/** Visual direction appended to an image prompt. Empty when no visual identity is set. */
export function brandImagePrompt(kit: BrandKit): string {
  const v = kit.visual;
  const palette = v.palette.map((s) => `${s.name || s.role} ${s.hex}`).join(", ");
  const parts = [
    v.imagery.style ? `Art direction: ${v.imagery.style}` : "",
    palette ? `Brand colours to work within: ${palette}.` : "",
    bullets("Always", v.imagery.doList),
    bullets("Never", v.imagery.dontList),
    bullets("Keep out of frame", v.imagery.avoid),
  ].filter(Boolean);
  if (!parts.length) return "";
  return [`Brand style for this image:`, ...parts, IMAGE_SAFETY].join("\n");
}

/*
 * AI / synthetic-media disclosure (docs/research/trends-2026.md §3).
 *
 * Networks split three ways and the UI must never pretend otherwise:
 *   "api"     — the publish call carries a real disclosure field
 *   "caption" — no field exists, so we append one visible line of copy
 *   "none"    — neither is possible on this channel
 *
 * Only SYNTHETIC media (realistic AI-generated image / video / audio) is
 * labelled. AI-assisted *text* is not a labelling trigger on any network whose
 * API we have confirmed, so it is recorded for the audit trail and nothing is
 * emitted.
 */
import type { ChannelDescriptor, PublishRequest } from "./types";

/** What the author declared, reduced to what an adapter needs. */
export type DisclosureInput = { synthetic: boolean; assisted: boolean };

/** What a channel can do about it. */
export type DisclosureSupport = "api" | "caption" | "none";

/** What the adapter actually emitted, recorded on the variant. */
export type DisclosureMethod = "api_field" | "caption_text" | "none";
export type DisclosureEmission = { method: DisclosureMethod; detail: string };

/** The line appended to copy on networks with no disclosure field. */
export const DISCLOSURE_LINE = "Made with AI";

/** Stored capabilities predate this field; a channel that never declared one still gets a caption. */
export function disclosureSupport(channel: Pick<ChannelDescriptor, "capabilities">): DisclosureSupport {
  return channel.capabilities.disclosure ?? "caption";
}

/** Nothing is labelled unless realistic synthetic media is present. */
export function disclosureRequired(d: DisclosureInput | undefined): boolean {
  return Boolean(d?.synthetic);
}

const NO_MEDIA: DisclosureEmission = { method: "none", detail: "No AI-generated media declared." };
const ASSISTED_ONLY: DisclosureEmission = { method: "none", detail: "AI-assisted text needs no network label." };

/** Decide the emission for one channel without performing it. Drives the composer preview. */
export function planDisclosure(support: DisclosureSupport, d: DisclosureInput | undefined, reason?: string): DisclosureEmission {
  if (!disclosureRequired(d)) return d?.assisted ? ASSISTED_ONLY : NO_MEDIA;
  if (support === "api") return { method: "api_field", detail: "Labelled via the network's AI-content field." };
  if (support === "caption") return { method: "caption_text", detail: `"${DISCLOSURE_LINE}" added to the caption.` };
  return { method: "none", detail: reason ?? "This channel offers no way to disclose AI-generated media." };
}

/** Append the line once; re-publishing the same text must not stack labels. */
export function withDisclosureLine(text: string): string {
  return text.includes(DISCLOSURE_LINE) ? text : `${text.trimEnd()}\n\n${DISCLOSURE_LINE}`.trimStart();
}

/**
 * Rewrite the request for the channel and report what will be emitted. Adapters
 * on the "api" path get the untouched text and read `request.disclosure`
 * themselves; everyone else gets the caption line already applied.
 */
export function applyDisclosure(
  channel: Pick<ChannelDescriptor, "capabilities">,
  req: PublishRequest,
): { request: PublishRequest; emitted: DisclosureEmission } {
  const support = disclosureSupport(channel);
  const emitted = planDisclosure(support, req.disclosure, channel.capabilities.reasons?.disclosure);
  if (emitted.method !== "caption_text") return { request: req, emitted };
  return { request: { ...req, text: withDisclosureLine(req.text) }, emitted };
}

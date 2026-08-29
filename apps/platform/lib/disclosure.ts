/*
 * AI disclosure, platform side (docs/research/trends-2026.md §3).
 *
 * The provider package owns what a network can do; this owns what the workspace
 * requires, what the composer shows, and when publishing is blocked.
 */
import type { Capabilities, DisclosureInput, DisclosureMethod } from "@rocketease/providers/client";
import { disclosureSupport, planDisclosure } from "@rocketease/providers/client";
import type { SyntheticFlag, SyntheticMedia } from "@/db/schema/content";

export const SYNTHETIC_CHOICES: { flag: SyntheticFlag; label: string; desc: string }[] = [
  { flag: "none", label: "No AI-generated media", desc: "Everything here was captured or made by a person." },
  { flag: "assisted", label: "AI-assisted text only", desc: "Copy was drafted or rewritten with AI; the media is real." },
  { flag: "synthetic_media", label: "Synthetic image, video or audio", desc: "Realistic AI-generated media. Networks require a label." },
];

/** The provider-level input a flag reduces to. */
export function toDisclosureInput(sm: SyntheticMedia | null | undefined): DisclosureInput {
  const flag = sm?.flag ?? "none";
  return { synthetic: flag === "synthetic_media", assisted: flag !== "none" };
}

/** What will be emitted for one destination — drives the composer preview and the block/warn rule. */
export function previewFor(caps: Pick<Capabilities, "disclosure" | "reasons">, sm: SyntheticMedia | null | undefined) {
  const channel = { capabilities: caps as Capabilities };
  return planDisclosure(disclosureSupport(channel), toDisclosureInput(sm), caps.reasons?.disclosure);
}

const METHOD_LABEL: Record<DisclosureMethod, string> = {
  api_field: "labelled via API",
  caption_text: "label added to caption",
  none: "no label sent",
};

/** Short per-destination line, e.g. "TikTok: labelled via API". */
export function previewLine(networkLabel: string, method: DisclosureMethod): string {
  return `${networkLabel}: ${METHOD_LABEL[method]}`;
}

export const DEFAULT_REQUIRE_AI_DISCLOSURE = false;

/** workspace.settings.requireAiDisclosure — off unless a workspace turns it on. */
export function readRequireAiDisclosure(settings: Record<string, unknown>): boolean {
  return settings.requireAiDisclosure === true;
}

export type DisclosureGap = { severity: "error" | "warning"; code: string; message: string };

/**
 * Synthetic media heading for a destination that cannot label it: an error when
 * the workspace demands disclosure, a warning otherwise. Nothing to say when
 * the destination can label it, or when no synthetic media was declared.
 */
export function disclosureGap(
  caps: Pick<Capabilities, "disclosure" | "reasons">,
  sm: SyntheticMedia | null | undefined,
  opts: { required: boolean; channelName: string },
): DisclosureGap | null {
  if (toDisclosureInput(sm).synthetic !== true) return null;
  const plan = previewFor(caps, sm);
  if (plan.method !== "none") return null;
  const why = `${opts.channelName} can't disclose AI-generated media. ${plan.detail}`;
  return opts.required
    ? { severity: "error", code: "ai_disclosure_unavailable", message: `${why} This workspace requires disclosure, so it can't be published here.` }
    : { severity: "warning", code: "ai_disclosure_unavailable", message: `${why} Add the disclosure to the copy yourself before publishing.` };
}

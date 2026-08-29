/*
 * What disclosure we suggest for a generated concept.
 *
 * Deterministic on purpose — the model never decides this. Copy drafted here is
 * always AI-assisted; it only becomes synthetic media when an image was
 * generated for it, and only then does any network need a label.
 */
import type { Capabilities } from "@rocketease/providers/client";
import { previewFor } from "@/lib/disclosure";
import type { DisclosureSuggestion } from "./types";

export function suggestDisclosure(caps: Capabilities, synthetic: boolean): DisclosureSuggestion {
  const flag = synthetic ? "synthetic_media" : "assisted";
  const plan = previewFor(caps, { flag, setBy: null, setAt: new Date().toISOString() });
  return { flag, detail: plan.detail, inCaption: plan.method === "caption_text" };
}

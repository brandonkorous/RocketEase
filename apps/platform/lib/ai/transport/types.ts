/*
 * One text vendor, behind one interface.
 *
 * This exists because the alternative was proven bad: drafting was written
 * straight against the Anthropic SDK, and when the subscription turned out not
 * to be able to buy Claude at all, "use a different model" meant editing the
 * one file every AI feature depends on. The prompts were already vendor-neutral
 * (lib/ai/prompts.ts calls nothing); the transport was the missing seam, and
 * packages/media had had the equivalent for images since M12.1.
 */
import type { Prompt } from "../prompts";

/** One completion, in the only terms the caller needs. */
export type Completion = {
  text: string;
  /** Real counts from the vendor. Never estimated - the credit ledger bills on these. */
  inputTokens: number;
  outputTokens: number;
  /** For reconciling a ledger row against a vendor's own record. Null when it gives none. */
  requestId: string | null;
};

export type TextTransport = {
  /** Which vendor answered. Recorded, so a bill and a ledger can be compared. */
  name: string;
  /**
   * What goes in ai_usage.model. On Azure this is the DEPLOYMENT name, not the
   * model id - the same distinction the image adapter already draws.
   */
  model: () => string;
  /** Throws on any vendor failure; lib/ai/client.ts turns that into AI_UNAVAILABLE. */
  complete: (prompt: Prompt) => Promise<Completion>;
};

/*
 * Voices in the database, and the gate in front of them.
 *
 * Everything here is workspace-scoped. A voice id is just a string on a jsonb
 * spec, so an unscoped lookup would let one tenant's plan speak in another
 * tenant's founder's voice — the worst possible version of this bug.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { voice, type ConsentScope, type Voice } from "@/db/schema/voice";
import { decideConsent, type ConsentDecision, type UsageScope } from "./policy";

export const loadVoice = async (workspaceId: string, voiceId: string): Promise<Voice | null> => {
  const [row] = await db.select().from(voice).where(and(eq(voice.id, voiceId), eq(voice.workspaceId, workspaceId)));
  return row ?? null;
};

export const listVoices = (workspaceId: string) =>
  db.select().from(voice).where(eq(voice.workspaceId, workspaceId)).orderBy(voice.label);

export type VoiceCheck = { ok: true; voice: Voice; decision: ConsentDecision } | { error: string };

/**
 * The one call every voice-using path makes. A missing voice and a refused one
 * both come back as a reason string, because to the person asking they are the
 * same event: this voice can't be used, and here is why.
 */
export async function checkVoice(workspaceId: string, voiceId: string, usage: UsageScope, now = new Date()): Promise<VoiceCheck> {
  const row = await loadVoice(workspaceId, voiceId);
  if (!row) return { error: "That voice isn't available in this workspace." };
  const decision = decideConsent(row, usage, now);
  if (!decision.allowed) return { error: decision.message };
  return { ok: true, voice: row, decision };
}

/**
 * What the generated audio may be used for. A voice-over made under organic-only
 * consent produces an ORGANIC-ONLY asset, so the existing rights preflight
 * blocks it from an ad without anyone having to remember the consent record.
 * Two independent layers, both real.
 */
export const rightsScopeForVoice = (row: Voice): ConsentScope => (row.kind === "stock" ? "both" : row.scope);

/** Voices whose consent lapses within the window, for the nightly warning. */
export async function voicesExpiringWithin(days: number, now = new Date()): Promise<Voice[]> {
  const rows = await db.select().from(voice);
  const limit = now.getTime() + days * 86_400_000;
  return rows.filter(
    (r) => r.kind !== "stock" && !r.revokedAt && r.expiresAt && r.expiresAt.getTime() > now.getTime() && r.expiresAt.getTime() <= limit,
  );
}

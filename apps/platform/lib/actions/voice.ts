"use server";

/*
 * Voice and consent actions (M12.3).
 *
 * The asymmetry is the design: adding a STOCK voice is an ordinary workspace
 * change; registering a cloned voice or a likeness asserts that a real person
 * consented, so it is an organization-OWNER action and it is audited.
 *
 * The vendors' own checks do not cover this. ElevenLabs' captcha proves the
 * uploader is the speaker; in an agency the uploader is an employee and the
 * speaker is the client's founder (docs/research/ai-media-2026.md §8).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { CONSENT_SCOPES, VOICE_KINDS, voice } from "@/db/schema/voice";
import { audit } from "@/lib/audit";
import { hasFeature } from "@/lib/features";
import { decideConsent, missingConsentFields, needsOwnerAuthorisation } from "@/lib/media/voice/policy";
import { listVoices } from "@/lib/media/voice/store";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";

const NO_ACCESS = "Voice generation isn't available for this organization.";
const OWNER_ONLY = "Only an organization owner can register a cloned voice or a likeness.";

const base = z.object({ workspaceId: z.string().min(1) });

const saveSchema = base.extend({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(VOICE_KINDS),
  adapter: z.string().trim().min(1).max(40),
  remoteVoiceId: z.string().trim().min(1).max(200),
  language: z.string().trim().max(20).optional(),
  note: z.string().trim().max(300).optional(),
  consentPersonName: z.string().trim().max(200).optional(),
  consentEvidenceAssetId: z.string().trim().max(64).optional(),
  expiresAt: z.string().trim().optional(),
  scope: z.enum(CONSENT_SCOPES).default("organic"),
});

async function gate(workspaceId: string) {
  const ctx = await requireWorkspace(workspaceId);
  return (await hasFeature(ctx.workspace.organizationId, "media.generation")) ? ctx : null;
}

/**
 * A replica needs an OWNER; a stock voice needs the ordinary settings capability.
 *
 * The owner check is on the role itself, not on a capability that happens to be
 * owner-only today. Gating somebody's likeness behind `org.billing` would quietly
 * widen the moment billing is ever delegated.
 */
async function authorise(workspaceId: string, kind: (typeof VOICE_KINDS)[number]) {
  if (!needsOwnerAuthorisation(kind)) return requireCapability(workspaceId, "workspace.settings");
  const ctx = await requireWorkspace(workspaceId);
  return ctx.workspace.role === "owner" ? ctx : null;
}

export async function saveVoice(input: z.input<typeof saveSchema>): Promise<ActionState & { voiceId?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That voice can't be saved.");
  const d = parsed.data;

  return guard(async () => {
    if (!(await gate(d.workspaceId))) return fail(NO_ACCESS);
    const ctx = await authorise(d.workspaceId, d.kind).catch(() => null);
    if (!ctx) return fail(needsOwnerAuthorisation(d.kind) ? OWNER_ONLY : "You can't change this workspace's settings.");

    const expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
    if (d.expiresAt && Number.isNaN(expiresAt!.getTime())) return fail("That consent expiry date can't be read.");

    // The evidence must be a real asset in THIS workspace, not an id someone typed.
    if (d.consentEvidenceAssetId) {
      const [evidence] = await db
        .select({ id: asset.id })
        .from(asset)
        .where(and(eq(asset.id, d.consentEvidenceAssetId), eq(asset.workspaceId, d.workspaceId)));
      if (!evidence) return fail("The consent evidence must be a file in this workspace's library.");
    }

    const row = {
      organizationId: ctx.workspace.organizationId,
      workspaceId: d.workspaceId,
      label: d.label,
      kind: d.kind,
      adapter: d.adapter,
      remoteVoiceId: d.remoteVoiceId,
      language: d.language ?? null,
      note: d.note ?? null,
      consentPersonName: d.consentPersonName ?? null,
      consentEvidenceAssetId: d.consentEvidenceAssetId ?? null,
      // Recording WHO asserted this is the point of the record.
      authorisedByUserId: needsOwnerAuthorisation(d.kind) ? ctx.session.user.id : null,
      authorisedAt: needsOwnerAuthorisation(d.kind) ? new Date() : null,
      expiresAt,
      scope: d.scope,
      createdByUserId: ctx.session.user.id,
    };

    // Refuse an incomplete replica up front rather than storing something unusable.
    const missing = needsOwnerAuthorisation(d.kind)
      ? missingConsentFields({ ...row, kind: d.kind, revokedAt: null })
      : [];
    if (missing.length) return fail(`A ${d.kind} voice needs a complete consent record — still missing ${missing.join(", ")}.`);

    const [saved] = await db
      .insert(voice)
      .values(row)
      .onConflictDoUpdate({ target: [voice.workspaceId, voice.adapter, voice.remoteVoiceId], set: { ...row, updatedAt: new Date() } })
      .returning({ id: voice.id });

    await audit({
      action: "workspace.settings",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: d.workspaceId,
      targetType: "voice",
      targetId: saved.id,
      summary: { note: `voice:${d.kind}`, after: { label: d.label, scope: d.scope, person: d.consentPersonName ?? null, expiresAt: d.expiresAt ?? null } },
    });
    return { ok: `“${d.label}” saved.`, voiceId: saved.id };
  });
}

const revokeSchema = base.extend({ voiceId: z.string().min(1), reason: z.string().trim().max(300).default("") });

/** Withdrawal is a record, never a delete: the history of a consent matters. */
export async function revokeVoiceConsent(input: z.input<typeof revokeSchema>): Promise<ActionState> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  const { workspaceId, voiceId, reason } = parsed.data;

  return guard(async () => {
    if (!(await gate(workspaceId))) return fail(NO_ACCESS);
    const owner = await requireWorkspace(workspaceId).catch(() => null);
    const ctx = owner?.workspace.role === "owner" ? owner : null;
    if (!ctx) return fail("Only an organization owner can withdraw consent.");

    const [row] = await db.select().from(voice).where(and(eq(voice.id, voiceId), eq(voice.workspaceId, workspaceId)));
    if (!row) return fail("That voice isn't in this workspace.");

    await db.update(voice).set({ revokedAt: new Date(), revokedReason: reason || null, updatedAt: new Date() }).where(eq(voice.id, voiceId));
    await audit({
      action: "workspace.settings",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "voice",
      targetId: voiceId,
      summary: { note: "voice:consent_withdrawn", before: { label: row.label }, after: { reason: reason || null } },
    });
    return { ok: `Consent for “${row.label}” withdrawn. It can't be used again.` };
  });
}

export type VoiceRow = { id: string; label: string; kind: string; scope: string; usable: boolean; reason: string };

/** The list a composer shows, each row already carrying WHY it can't be used. */
export async function listWorkspaceVoices(workspaceId: string): Promise<VoiceRow[] | { error: string }> {
  if (!(await gate(workspaceId))) return { error: NO_ACCESS };
  const now = new Date();
  const rows = await listVoices(workspaceId);
  return rows.map((r) => {
    const decision = decideConsent(r, "organic", now);
    return {
      id: r.id,
      label: r.label,
      kind: r.kind,
      scope: r.scope,
      usable: decision.allowed,
      reason: decision.allowed ? "" : decision.message,
    };
  });
}

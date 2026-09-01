"use server";

/*
 * Caption actions (M12.3).
 *
 * Captions are an accessibility feature first (WCAG 2.2 AA) and a reach feature
 * second — social video autoplays muted. Both point the same way, so this is the
 * least ambiguous thing in the whole media stack.
 *
 * Requesting and burning are enqueued; editing is immediate, because a person
 * fixing a misheard word should see it fixed.
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { captionTrack } from "@/db/schema/voice";
import { audit } from "@/lib/audit";
import { hasFeature } from "@/lib/features";
import { emit } from "@/lib/jobs/outbox";
import { PLACEMENTS } from "@/lib/media/canvas/specs";
import { buildCues, charsPerSecond, cueText, tooFastToRead } from "@/lib/media/captions/cues";
import { SIDECAR, type SidecarFormat } from "@/lib/media/captions/formats";
import { upsertCaptionTrack, writeSidecar } from "@/lib/media/captions/store";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";

const NO_ACCESS = "Captions aren't available for this organization.";

const base = z.object({ workspaceId: z.string().min(1), assetId: z.string().min(1) });

async function gate(workspaceId: string, capability?: "content.create") {
  const ctx = capability ? await requireCapability(workspaceId, capability) : await requireWorkspace(workspaceId);
  return (await hasFeature(ctx.workspace.organizationId, "media.generation")) ? ctx : null;
}

/** Workspace-scoped, always: an asset id from another tenant must not resolve. */
async function loadAsset(workspaceId: string, assetId: string) {
  const [row] = await db
    .select()
    .from(asset)
    .where(and(eq(asset.id, assetId), eq(asset.workspaceId, workspaceId), isNull(asset.deletedAt)));
  return row ?? null;
}

const requestSchema = base.extend({ language: z.string().trim().max(20).optional(), force: z.boolean().default(false) });

export async function requestCaptions(input: z.input<typeof requestSchema>): Promise<ActionState> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  const { workspaceId, assetId, language, force } = parsed.data;

  return guard(async () => {
    const ctx = await gate(workspaceId, "content.create");
    if (!ctx) return fail(NO_ACCESS);
    const row = await loadAsset(workspaceId, assetId);
    if (!row) return fail("That file is no longer in the library.");
    if (row.kind !== "video" && row.kind !== "audio") return fail("Only video and audio can be transcribed.");

    await db.transaction(async (tx) => {
      await emit(tx, "media.transcribe", { assetId, language, force }, {
        organizationId: row.organizationId,
        workspaceId,
        dedupeKey: `media.transcribe:${assetId}:${language ?? "auto"}`,
      });
    });
    return { ok: "Transcribing. Captions will appear on this file when it's done." };
  });
}

const editSchema = base.extend({
  language: z.string().trim().min(1).max(20),
  words: z
    .array(z.object({ text: z.string().max(200), startMs: z.number().int().min(0), endMs: z.number().int().min(0), speaker: z.string().max(60).optional() }))
    .max(20_000),
});

/** An edit replaces the words and regenerates the sidecar, so the two can't drift. */
export async function saveCaptions(input: z.input<typeof editSchema>): Promise<ActionState> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Those captions can't be saved.");
  const { workspaceId, assetId, language, words } = parsed.data;

  return guard(async () => {
    const ctx = await gate(workspaceId, "content.create");
    if (!ctx) return fail(NO_ACCESS);
    const row = await loadAsset(workspaceId, assetId);
    if (!row) return fail("That file is no longer in the library.");

    const track = await upsertCaptionTrack({
      organizationId: row.organizationId,
      workspaceId,
      assetId,
      language,
      source: "edited",
      words,
      text: words.map((w) => w.text.trim()).filter(Boolean).join(" "),
      userId: ctx.session.user.id,
    });
    await writeSidecar(track);

    await audit({
      action: "asset.update",
      actorUserId: ctx.session.user.id,
      organizationId: row.organizationId,
      workspaceId,
      targetType: "asset",
      targetId: assetId,
      summary: { note: `captions:${language}`, after: { words: words.length } },
    });
    return { ok: "Captions saved." };
  });
}

const burnSchema = base.extend({ captionTrackId: z.string().min(1), placement: z.enum(PLACEMENTS) });

export async function burnInCaptions(input: z.input<typeof burnSchema>): Promise<ActionState> {
  const parsed = burnSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  const { workspaceId, assetId, captionTrackId, placement } = parsed.data;

  return guard(async () => {
    if (!(await gate(workspaceId, "content.create"))) return fail(NO_ACCESS);
    const row = await loadAsset(workspaceId, assetId);
    if (!row) return fail("That video is no longer in the library.");
    if (row.kind !== "video") return fail("Captions can only be burned into a video.");

    await db.transaction(async (tx) => {
      await emit(tx, "media.render", { kind: "caption_burn", assetId, captionTrackId, placement }, {
        organizationId: row.organizationId,
        workspaceId,
        dedupeKey: `media.render:burn:${assetId}:${captionTrackId}:${placement}`,
      });
    });
    return { ok: "Burning captions in. A new captioned video will appear in the library." };
  });
}

export type CaptionReview = {
  language: string;
  source: string;
  cues: { startMs: number; endMs: number; text: string; cps: number }[];
  tooFast: number;
  sidecarFormats: SidecarFormat[];
};

/** What the caption editor renders: derived cues, plus what reads too fast. */
export async function reviewCaptions(input: z.input<typeof base>): Promise<CaptionReview[] | { error: string }> {
  const parsed = base.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  if (!(await gate(parsed.data.workspaceId))) return { error: NO_ACCESS };
  const row = await loadAsset(parsed.data.workspaceId, parsed.data.assetId);
  if (!row) return { error: "That file is no longer in the library." };

  const tracks = await db.select().from(captionTrack).where(eq(captionTrack.assetId, row.id));
  return tracks.map((t) => {
    const cues = buildCues(t.words);
    return {
      language: t.language,
      source: t.source,
      cues: cues.map((c) => ({ startMs: c.startMs, endMs: c.endMs, text: cueText(c), cps: Math.round(charsPerSecond(c)) })),
      tooFast: tooFastToRead(cues).length,
      sidecarFormats: Object.keys(SIDECAR) as SidecarFormat[],
    };
  });
}

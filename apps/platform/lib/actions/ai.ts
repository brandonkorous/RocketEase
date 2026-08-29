"use server";

import { z } from "zod";
import type { ProductEventName } from "@/db/schema/telemetry";
import { AI_UNCONFIGURED, aiConfigured, generate } from "@/lib/ai/client";
import { loadBrandVoice, loadDraftChannels, loadReplyContext } from "@/lib/ai/context";
import { captionDrafts, repurposeDrafts, replyDrafts, type AiDraftState } from "@/lib/ai/drafts";
import { requireCapability } from "@/lib/session";
import { track } from "@/lib/telemetry";
import { guard } from "./content/shared";

/* ai.* isn't in PRODUCT_EVENTS yet (that list lives in db/schema); the column is free text. */
const ev = (name: "ai.draft.requested" | "ai.draft.used") => name as ProductEventName;

const workspaceId = z.string().min(1);
const captionSchema = z.object({ workspaceId, text: z.string().trim().min(1).max(5_000), channels: z.array(z.string().min(1)).min(1).max(10) });
const repurposeSchema = z.object({ workspaceId, sourceText: z.string().trim().min(1).max(20_000), targets: z.array(z.string().min(1)).min(1).max(10) });
const replySchema = z.object({ workspaceId, conversationId: z.string().min(1) });

const NO_CHANNELS = "Pick a connected channel to draft for.";

/** Drafts are returned as text for a person to edit. Nothing is saved or sent here. */
export async function draftCaptionVariants(input: z.input<typeof captionSchema>): Promise<AiDraftState> {
  const parsed = captionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Write something to draft from first." };
  const { workspaceId: ws, text, channels } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    if (!aiConfigured()) return { error: AI_UNCONFIGURED };
    const [voice, targets] = await Promise.all([loadBrandVoice(ws), loadDraftChannels(ws, channels)]);
    if (!targets.length) return { error: NO_CHANNELS };
    await requested(ctx, ws, "caption", targets.length);
    return captionDrafts({ channels: targets, text, voice }, generate);
  });
}

export async function repurpose(input: z.input<typeof repurposeSchema>): Promise<AiDraftState> {
  const parsed = repurposeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Paste the material to repurpose first." };
  const { workspaceId: ws, sourceText, targets } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    if (!aiConfigured()) return { error: AI_UNCONFIGURED };
    const [voice, channels] = await Promise.all([loadBrandVoice(ws), loadDraftChannels(ws, targets)]);
    if (!channels.length) return { error: NO_CHANNELS };
    await requested(ctx, ws, "repurpose", channels.length);
    return repurposeDrafts({ channels, sourceText, voice }, generate);
  });
}

/** A reply suggestion grounded in the thread, the brand voice, and saved replies. */
export async function draftReply(input: z.input<typeof replySchema>): Promise<AiDraftState> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: "Open a conversation first." };
  const { workspaceId: ws, conversationId } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "conversations.handle");
    if (!aiConfigured()) return { error: AI_UNCONFIGURED };
    const voice = await loadBrandVoice(ws);
    const context = await loadReplyContext(ws, conversationId, ctx.workspace.timezone, voice);
    if (!context) return { error: "There's nothing in this conversation to reply to yet." };
    await requested(ctx, ws, "reply", 1);
    return replyDrafts(context, generate);
  });
}

type Ctx = Awaited<ReturnType<typeof requireCapability>>;
type DraftKind = "caption" | "repurpose" | "reply";

async function requested(ctx: Ctx, ws: string, kind: DraftKind, targets: number) {
  await track(ev("ai.draft.requested"), { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId: ws, surface: `action:ai.${kind}`, props: { kind, targets } });
}

/** Called when a person actually inserts a suggestion. No draft content is recorded. */
export async function recordDraftUsed(ws: string, kind: DraftKind): Promise<{ ok: true }> {
  const ctx = await requireCapability(ws, kind === "reply" ? "conversations.handle" : "content.create");
  await track(ev("ai.draft.used"), { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId: ws, surface: `action:ai.${kind}`, props: { kind } });
  return { ok: true };
}

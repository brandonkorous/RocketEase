"use server";

import { z } from "zod";
import { db } from "@/db";
import { AI_UNCONFIGURED, aiConfigured, aiGenerator } from "@/lib/ai/client";
import { loadBrandContext, loadDraftChannels } from "@/lib/ai/context";
import { saveBriefRow } from "@/lib/ai/generator/briefs";
import { imageGeneratorFor } from "@/lib/ai/generator/image-assets";
import { imagesConfigured, MAX_IMAGES } from "@/lib/ai/generator/images";
import { runGenerator, runRegenerate } from "@/lib/ai/generator/run";
import { brandImagePrompt } from "@/lib/brand/prompt";
import { loadBrandKit } from "@/lib/brand/store";
import { draftFromConcept } from "@/lib/ai/generator/send";
import { briefSchema, conceptWireSchema, type Brief, type Concept, type GeneratorResult } from "@/lib/ai/generator/types";
import { workspacePath } from "@/lib/nav";
import { requireCapability } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { track } from "@/lib/telemetry";
import { guard } from "./content/shared";

/* Every state carries the optional { error, ok } shape so `guard()` fits without a cast. */
export type GeneratorState = Partial<GeneratorResult> & { error?: string; ok?: string };
export type ConceptState = { concept?: Concept; error?: string; ok?: string };
export type ImageState = { images?: { assetId: string; url: string }[]; error?: string; ok?: string };
export type SendState = { url?: string; error?: string; ok?: string };
export type SaveState = { error?: string; ok?: string };

const workspaceId = z.string().min(1);
const runSchema = z.object({ workspaceId, brief: briefSchema });
const NO_CHANNELS = "Pick a connected channel to generate for.";
const badBrief = (e: z.ZodError) => e.issues[0]?.message ?? "Check the brief and try again.";

/** Concepts (and optional ad copy) for a brief. Nothing is saved, scheduled, or sent. */
export async function generateConcepts(input: { workspaceId: string; brief: Brief }): Promise<GeneratorState> {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { error: badBrief(parsed.error) };
  const { workspaceId: ws, brief } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    if (!aiConfigured()) return { error: AI_UNCONFIGURED };
    const [brand, channels] = await Promise.all([loadBrandContext(ws, ctx.workspace.timezone), loadDraftChannels(ws, brief.channels)]);
    if (!channels.length) return { error: NO_CHANNELS };
    const meta = { organizationId: ctx.workspace.organizationId, workspaceId: ws, userId: ctx.session.user.id };
    await track("ai.generate.requested", { userId: meta.userId, organizationId: meta.organizationId, workspaceId: ws, surface: "action:generator.run", props: { goal: brief.goal, channels: channels.length, count: brief.count, ads: brief.includeAds } });
    return runGenerator({ brief: brief as Brief, channels, ...brand }, aiGenerator({ ...meta, kind: "generate_post" }), aiGenerator({ ...meta, kind: "generate_ad" }));
  });
}

const regenSchema = z.object({ workspaceId, brief: briefSchema, channelId: z.string().min(1), avoid: z.array(z.string().trim().max(300)).max(10).default([]) });

/** One replacement concept for one card, told which angles were already shown. */
export async function regenerateConcept(input: z.input<typeof regenSchema>): Promise<ConceptState> {
  const parsed = regenSchema.safeParse(input);
  if (!parsed.success) return { error: badBrief(parsed.error) };
  const { workspaceId: ws, brief, channelId, avoid } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    if (!aiConfigured()) return { error: AI_UNCONFIGURED };
    const [brand, channels] = await Promise.all([loadBrandContext(ws, ctx.workspace.timezone), loadDraftChannels(ws, [channelId])]);
    if (!channels.length) return { error: NO_CHANNELS };
    const meta = { organizationId: ctx.workspace.organizationId, workspaceId: ws, userId: ctx.session.user.id, kind: "generate_post" as const };
    return runRegenerate({ brief: brief as Brief, channel: channels[0], ...brand, avoid }, aiGenerator(meta));
  });
}

const sendSchema = z.object({ workspaceId, concept: conceptWireSchema, assetIds: z.array(z.string().min(1)).max(10).default([]) });

/** Creates an ordinary draft and hands back the Create URL. A person still sends it. */
export async function sendToCreate(input: z.input<typeof sendSchema>): Promise<SendState> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "That concept can't be sent to Create. Edit it and try again." };
  const { workspaceId: ws, concept, assetIds } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    const actor = { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId: ws };
    const { itemId } = await draftFromConcept(actor, concept, assetIds);
    await track("ai.generate.used", { userId: actor.userId, organizationId: actor.organizationId, workspaceId: ws, surface: "action:generator.send", props: { synthetic: concept.syntheticMedia } });
    return { url: workspacePath(ws, `create?item=${itemId}`), ok: "Draft created." };
  });
}

const imageSchema = z.object({
  workspaceId,
  prompt: z.string().trim().min(3).max(1_500),
  aspect: z.enum(["square", "portrait", "landscape"]).default("square"),
  count: z.coerce.number().int().min(1).max(MAX_IMAGES).default(1),
  altText: z.string().trim().max(1_000).optional(),
});

/** Generated images land in the library flagged as AI-made, exactly like an upload otherwise. */
export async function generateImage(input: z.input<typeof imageSchema>): Promise<ImageState> {
  const parsed = imageSchema.safeParse(input);
  if (!parsed.success) return { error: "Describe the image you want first." };
  const { workspaceId: ws, prompt, aspect, count, altText } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    if (!imagesConfigured()) return { error: "Image generation isn't configured." };
    const actor = { organizationId: ctx.workspace.organizationId, workspaceId: ws, userId: ctx.session.user.id };
    const generator = imageGeneratorFor(actor, altText ?? null);
    if (!generator) return { error: "Image generation isn't configured." };
    // The brand's visual direction is appended server-side, so every image from
    // this workspace follows the same palette and house style.
    const style = brandImagePrompt(await loadBrandKit(ws));
    const res = await generator.generate([prompt, style].filter(Boolean).join("\n\n"), { aspect, count });
    if ("error" in res) return res;
    await track("ai.image.generated", { userId: actor.userId, organizationId: actor.organizationId, workspaceId: ws, surface: "action:generator.image", props: { count: res.assetIds.length, aspect, branded: Boolean(style) } });
    return { images: await previews(ws, res.assetIds) };
  });
}

const saveSchema = z.object({ workspaceId, name: z.string().trim().min(1).max(120), brief: briefSchema });

export async function saveBrief(input: z.input<typeof saveSchema>): Promise<SaveState> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: badBrief(parsed.error) };
  const { workspaceId: ws, name, brief } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    await saveBriefRow({ organizationId: ctx.workspace.organizationId, workspaceId: ws, userId: ctx.session.user.id, name, brief: brief as Brief });
    return { ok: "Brief saved." };
  });
}

async function previews(ws: string, assetIds: string[]) {
  const rows = assetIds.length ? await db.query.asset.findMany({ where: (a, { and, eq, inArray }) => and(eq(a.workspaceId, ws), inArray(a.id, assetIds)) }) : [];
  return Promise.all(rows.map(async (r) => ({ assetId: r.id, url: await presignGet(r.storageKey, 3600, r.fileName) })));
}

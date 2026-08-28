"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trackingSource } from "@/db/schema/tracking";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/boss";
import { requireCapability } from "@/lib/session";
import { KIND_LABEL, windowLabel } from "@/lib/tracking/labels";
import { trackingWebhookUrl } from "@/lib/tracking/oauth-state";
import { sealTrackingSecret } from "@/lib/tracking/sources";
import { newWebhookSecret } from "@/lib/tracking/webhook";
import { fail, guard, type ActionState } from "../content/shared";

/** The signing secret is returned exactly once, on creation or rotation; it is never readable again. */
export type SecretState = ActionState & { secret?: string; endpoint?: string };

const idSchema = z.object({ workspaceId: z.string().min(1), sourceId: z.string().min(1) });
const createSchema = z.object({ workspaceId: z.string().min(1), name: z.string().trim().min(1, "Give the source a name.").max(80) });

const loadSource = async (workspaceId: string, sourceId: string) =>
  db.query.trackingSource.findFirst({ where: (s, { and: a, eq: e }) => a(e(s.id, sourceId), e(s.workspaceId, workspaceId)) });

/** Create a webhook source and show its signing secret once. */
export async function createWebhookSource(input: z.input<typeof createSchema>): Promise<SecretState> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the source name.");
  const { workspaceId, name } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const signingSecret = newWebhookSecret();
    const [row] = await db
      .insert(trackingSource)
      .values({ organizationId: ctx.workspace.organizationId, workspaceId, kind: "webhook", name, status: "healthy", config: { windowLabel: windowLabel("webhook") }, health: { ok: true }, createdByUserId: ctx.session.user.id })
      .returning();
    await db.update(trackingSource).set({ secret: sealTrackingSecret(row.id, { kind: "webhook", signingSecret }) }).where(eq(trackingSource.id, row.id));
    await audit({ action: "tracking.connected", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "tracking_source", targetId: row.id, summary: { after: { kind: "webhook", name } } });
    return { ok: "Conversion webhook created. Copy the signing secret now — it is not shown again.", secret: signingSecret, endpoint: trackingWebhookUrl(row.id) };
  }) as Promise<SecretState>;
}

/** Replace a webhook source's signing secret; the old one stops verifying immediately. */
export async function rotateWebhookSecret(input: z.input<typeof idSchema>): Promise<SecretState> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("Unknown tracking source.");
  const { workspaceId, sourceId } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const source = await loadSource(workspaceId, sourceId);
    if (!source || source.kind !== "webhook") return fail("That is not a webhook source.");
    const signingSecret = newWebhookSecret();
    await db.update(trackingSource).set({ secret: sealTrackingSecret(source.id, { kind: "webhook", signingSecret }), updatedAt: new Date() }).where(eq(trackingSource.id, source.id));
    await audit({ action: "tracking.secret_rotated", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "tracking_source", targetId: source.id });
    return { ok: "New signing secret issued. Update your sender before the next event.", secret: signingSecret, endpoint: trackingWebhookUrl(source.id) };
  }) as Promise<SecretState>;
}

/** Disconnect a source. Facts already imported stay; nothing new arrives. */
export async function disconnectTrackingSource(input: z.input<typeof idSchema>): Promise<ActionState> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("Unknown tracking source.");
  const { workspaceId, sourceId } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const source = await loadSource(workspaceId, sourceId);
    if (!source) return fail("Tracking source not found.");
    await db
      .update(trackingSource)
      .set({ status: "disconnected", disconnectedAt: new Date(), secret: null, health: { ok: false, message: "Disconnected." }, updatedAt: new Date() })
      .where(and(eq(trackingSource.id, source.id), eq(trackingSource.workspaceId, workspaceId)));
    await audit({ action: "tracking.disconnected", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "tracking_source", targetId: source.id, summary: { before: { kind: KIND_LABEL[source.kind], name: source.name } } });
    return { ok: `${source.name} disconnected. Conversions already imported are kept and labelled with their source.` };
  });
}

/** Pull now instead of waiting for the hourly tick. */
export async function syncTrackingSourceNow(input: z.input<typeof idSchema>): Promise<ActionState> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("Unknown tracking source.");
  const { workspaceId, sourceId } = parsed.data;
  return guard(async () => {
    await requireCapability(workspaceId, "workspace.settings");
    const source = await loadSource(workspaceId, sourceId);
    if (!source || source.disconnectedAt) return fail("Tracking source not found.");
    await enqueue("tracking.sync", { sourceId: source.id }, { singletonKey: `tracking.sync:${source.id}`, singletonSeconds: 30 });
    return { ok: `Checking ${source.name} now. Results appear once the import finishes.` };
  });
}

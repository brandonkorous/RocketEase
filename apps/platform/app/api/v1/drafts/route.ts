import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { postVariant } from "@/db/schema/content";
import { authenticateApi, idempotencyKey, requireScope } from "@/lib/api/auth";
import { apiBody, apiHandler, apiJson, invalid } from "@/lib/api/errors";
import { itemView, problemsView } from "@/lib/api/serialize";
import { matchPolicy } from "@/lib/approvals";
import { createContentItem, itemByIdempotencyKey, UnknownChannelError } from "@/lib/authoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 timestamp");
const bodySchema = z.object({
  title: z.string().trim().max(200).optional(),
  text: z.string().max(10_000).default(""),
  channelIds: z.array(z.string().min(1)).min(1, "Choose at least one channel.").max(20),
  /** Intent only: the draft stays a draft until it is submitted. */
  scheduledAt: isoDate.optional(),
  link: z.string().url().max(2048).optional(),
  /** Media already uploaded to the workspace's library. */
  media: z.array(z.object({ assetId: z.string().min(1) })).max(35).optional(),
  assetIds: z.array(z.string().min(1)).max(35).optional(),
});

/** POST /api/v1/drafts — create a draft post. Nothing is published or scheduled here. */
export async function POST(req: Request) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    requireScope(ctx, "content.create");
    const parsed = bodySchema.safeParse(await apiBody(req));
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? "Invalid draft.");
    const input = parsed.data;
    const idem = idempotencyKey(ctx, req);

    if (idem) {
      const prior = await itemByIdempotencyKey(ctx.workspaceId, idem);
      if (prior) {
        const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, prior.id));
        return apiJson({ item: itemView(prior, variants), validation: [], idempotentReplay: true });
      }
    }

    const actor = { userId: ctx.actorUserId, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId };
    try {
      const { item, variants, problems } = await createContentItem(
        actor,
        {
          title: input.title,
          text: input.text,
          link: input.link ?? null,
          channelIds: input.channelIds,
          assetIds: input.assetIds ?? input.media?.map((m) => m.assetId) ?? [],
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          apiIdempotencyKey: idem,
        },
        "api:createDraft",
      );
      const policy = await matchPolicy({ workspaceId: ctx.workspaceId, itemId: item.id, authorRole: ctx.role });
      return apiJson(
        {
          item: itemView(item, variants),
          validation: problemsView(problems),
          approval: { required: Boolean(policy), policy: policy?.name ?? null },
          next: "POST /api/v1/drafts/{id}/submit — a person approves and publishes.",
        },
        201,
      );
    } catch (e) {
      if (e instanceof UnknownChannelError) throw invalid(`${e.message}. Call GET /api/v1/channels for usable ids.`);
      throw e;
    }
  });
}

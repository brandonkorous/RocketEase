"use server";

/*
 * Generating a video clip.
 *
 * Separate from generator.ts because video is a different SHAPE, not a longer
 * image: Sora runs for minutes, so this always queues and never returns bytes.
 * The person is told it is coming rather than made to wait on a spinner.
 *
 * Durations are the model's, not ours (4/8/12) — 6 seconds is a 400 at the
 * vendor, so the enum refuses it here where the message can be useful.
 */
import { z } from "zod";
import { brandImagePrompt } from "@/lib/brand/prompt";
import { loadBrandKit } from "@/lib/brand/store";
import { canGenerate, createMediaJob } from "@/lib/media/jobs";
import { requireCapability } from "@/lib/session";
import { track } from "@/lib/telemetry";
import { guard } from "./content/shared";

export type VideoState = { ok?: string; error?: string };

const schema = z.object({
  workspaceId: z.string().min(1),
  prompt: z.string().trim().min(3).max(1_500),
  aspect: z.enum(["9:16", "16:9"]).default("9:16"),
  seconds: z.union([z.literal(4), z.literal(8), z.literal(12)]).default(4),
});

export async function generateVideo(input: z.input<typeof schema>): Promise<VideoState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Describe the clip you want first." };
  const { workspaceId: ws, prompt, aspect, seconds } = parsed.data;

  return guard(async () => {
    const ctx = await requireCapability(ws, "content.create");
    if (!canGenerate("hero_shot")) return { error: "Video generation isn't configured." };

    // Same brand direction images get: one workspace, one look.
    const style = brandImagePrompt(await loadBrandKit(ws));
    const res = await createMediaJob({
      organizationId: ctx.workspace.organizationId,
      workspaceId: ws,
      userId: ctx.session.user.id,
      spec: { jobKind: "hero_shot", prompt: [prompt, style].filter(Boolean).join("\n\n"), aspect, durationSeconds: seconds, count: 1 },
    });
    if ("error" in res) return { error: res.error };

    await track("ai.video.generated", {
      userId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: ws,
      surface: "action:video.generate",
      props: { seconds, aspect, model: res.modelKey },
    });
    return { ok: `Generating a ${seconds}-second clip. It takes a few minutes and lands in the library when it's ready.` };
  });
}

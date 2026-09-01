/*
 * Images for a concept card, generated through the media pipeline.
 *
 * There is no second image path any more. This routes like every other
 * generation — a model is chosen for a stated reason, the estimate is checked
 * against the spending ceiling, and a media_job row records what ran — and the
 * bytes enter the library through the same door as an upload.
 *
 * It runs inline rather than through the worker because the routed vendor
 * answers in one call and the person is watching. run-now.ts hands a slow one
 * to the poller instead.
 */
import "server-only";
import { runMediaJobNow } from "@/lib/media/run-now";
import { conceptImageSpec, type ImageOptions } from "./image-spec";

export type ImageActor = { organizationId: string; workspaceId: string; userId: string };
export type ConceptImageResult = { assetIds: string[] } | { pending: string } | { error: string };

export { MAX_IMAGES, type ImageAspect, type ImageOptions } from "./image-spec";

export async function generateConceptImages(
  actor: ImageActor,
  prompt: string,
  opts: ImageOptions,
  altText: string | null = null,
): Promise<ConceptImageResult> {
  const run = await runMediaJobNow({ ...actor, spec: conceptImageSpec(prompt, opts, altText) });
  if ("error" in run) return run;
  // Nothing failed — this model takes minutes, so the library is where it lands.
  if ("pending" in run) return { pending: "The image is being generated. It'll appear in the library when it's done." };
  return { assetIds: run.assetIds };
}

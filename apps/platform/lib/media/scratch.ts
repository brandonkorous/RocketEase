/*
 * Scratch space for renders.
 *
 * ffmpeg needs real files for anything that seeks or that a filter names by
 * path, so piping bytes only goes so far. The media worker has a 20Gi emptyDir
 * mounted for exactly this (deploy/k8s/base/media-worker.yaml).
 *
 * The directory is ALWAYS removed, including when the work throws. A render
 * that fails and leaves a 400MB intermediate behind fills the volume, and the
 * next render fails for a reason that has nothing to do with it.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const scratchRoot = () => process.env.MEDIA_SCRATCH_DIR || tmpdir();

/** Run `work` in a fresh directory, then delete it whatever happened. */
export async function withScratch<T>(prefix: string, work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(scratchRoot(), `${prefix}-`));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

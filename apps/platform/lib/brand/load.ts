/*
 * Reading the kit. Separate from store.ts because that file is `server-only`
 * and the media worker — which composites a client's type in the brand's own
 * colours and fonts — must be able to read the kit without pulling a Next.js
 * server module into a plain Node process.
 *
 * Reads only. Writes stay in store.ts, behind `server-only`, on purpose.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { readBrandKit } from "./read";
import type { BrandKit } from "./types";

export async function loadWorkspaceSettings(workspaceId: string): Promise<Record<string, unknown> | null> {
  const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
  return ws?.settings ?? null;
}

export async function loadBrandKit(workspaceId: string): Promise<BrandKit> {
  const settings = await loadWorkspaceSettings(workspaceId);
  return readBrandKit(settings ?? {});
}

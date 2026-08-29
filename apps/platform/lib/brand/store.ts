/*
 * Reading and writing the kit. It lives on `workspace.settings.brandKit`, so a
 * section save is a merge into one JSON column — no schema of its own, and the
 * whole kit stays readable by anything that already loads workspace settings.
 */
import "server-only";
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

/**
 * Merge one section into the stored kit. The legacy `brandVoice` key is dropped
 * on the first write so voice has exactly one home afterwards.
 */
export async function writeBrandSection(workspaceId: string, settings: Record<string, unknown>, patch: Record<string, unknown>) {
  const stored = (settings.brandKit ?? {}) as Record<string, unknown>;
  const next = { ...settings, brandKit: { ...stored, ...patch } };
  delete (next as Record<string, unknown>).brandVoice;
  await db.update(workspace).set({ settings: next, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
}

const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg" };

export const logoExtension = (mimeType: string) => EXT[mimeType] ?? null;

/** Deterministic per role: re-uploading a logo replaces it instead of orphaning the old object. */
export const brandLogoKey = (workspaceId: string, role: string, ext: string) => `ws/${workspaceId}/brand/logo-${role}${ext}`;

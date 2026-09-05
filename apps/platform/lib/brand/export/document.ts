/*
 * The export document's shape, kept apart from build.ts (which is server-only)
 * so the renderer and its test can import the type without a database.
 */
import type { BrandKit, LogoRole } from "../types";

export type LogoDoc = { role: LogoRole; label: string; dataUri: string | null; note: string };
export type AssetDoc = { title: string; size: string | null; rights: string };

export type BrandDocument = {
  meta: { title: string; workspaceName: string; generatedAt: string; timezone: string; today: string };
  preparedBy: { name: string; logo: string | null };
  kit: BrandKit;
  logos: LogoDoc[];
  assets: AssetDoc[];
};

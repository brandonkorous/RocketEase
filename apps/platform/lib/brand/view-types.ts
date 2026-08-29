/*
 * View shapes for brand media. Client-safe on purpose: the loaders that build
 * them (`views.ts`) are server-only, but the components that render them are not.
 */
import type { LogoRole } from "./types";

export type LogoView = { role: LogoRole; url: string; note: string };
export type AssetView = { id: string; title: string; url: string | null; size: string | null; rights: string | null; expired: boolean };

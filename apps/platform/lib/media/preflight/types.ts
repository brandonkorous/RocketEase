/*
 * What preflight says, and the narrow facts it needs to say it.
 *
 * Every check is pure: rows in, issues out. Nothing here reads a database or
 * opens an image, so the whole ruleset is testable without fixtures — which is
 * the only way a rule about a client's ad rights stays trustworthy.
 */
import type { Placement } from "@/lib/media/canvas/specs";

export type CreativeIssue = {
  severity: "error" | "warning";
  code: string;
  /** A whole sentence a person can act on. Never a bare code. */
  message: string;
  placement?: Placement;
  variantId?: string;
  overlayId?: string;
};

/** Exactly the asset columns preflight judges — not the whole row. */
export type PreflightAsset = {
  id: string;
  fileName: string;
  kind: "image" | "video" | "document" | "audio";
  width: number | null;
  height: number | null;
  /** Probed, never assumed. Null means unknown — which is not the same as 0. */
  durationSeconds: number | null;
  uploadStatus: "pending" | "processing" | "ready" | "failed";
  scanStatus: "pending" | "clean" | "infected" | "error";
  rightsScope: "organic" | "paid" | "both";
  rightsExpiresAt: Date | null;
  licenseSource: "owned" | "stock" | "platform_library" | "ai_generated";
  platformClearance: Record<string, boolean>;
  generatedByAi: boolean;
};

export const error = (code: string, message: string, extra: Partial<CreativeIssue> = {}): CreativeIssue => ({
  severity: "error",
  code,
  message,
  ...extra,
});

export const warn = (code: string, message: string, extra: Partial<CreativeIssue> = {}): CreativeIssue => ({
  severity: "warning",
  code,
  message,
  ...extra,
});

export const blocking = (issues: CreativeIssue[]): CreativeIssue[] => issues.filter((i) => i.severity === "error");

/** True when nothing blocks. Warnings never stop a person from shipping. */
export const passes = (issues: CreativeIssue[]): boolean => blocking(issues).length === 0;

/** Days from now, negative when already past. */
export const daysUntil = (at: Date, now: Date): number => Math.floor((at.getTime() - now.getTime()) / 86_400_000);

/*
 * Shapes shared by the plan editor's server loader and client components.
 * Everything here is data — URLs are presigned server-side, and vendor
 * dollars never appear (workspaces see credits only).
 */
import type { AcceptanceStatus } from "@/lib/media/plan/acceptance";
import type { AdPlan } from "@/lib/media/plan/types";
import type { RenderStatus } from "@/lib/media/compose/fingerprint";
import type { CreativeIssue } from "@/lib/media/preflight/types";
import type { BrandKit } from "@/lib/brand/types";

/** One library asset the plan references, with a presigned URL for the preview. */
export type EditorAsset = {
  id: string;
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  url: string | null;
  durationSeconds: number | null;
};

export type EditorCue = { startMs: number; endMs: number; text: string };

export type EditorVoice = { id: string; label: string; kind: string };

export type EditorData = {
  workspaceId: string;
  contentItemId: string;
  plan: AdPlan;
  /** False when this draft has no stored plan yet — the first Save creates it. */
  planExists: boolean;
  kit: BrandKit | null;
  /** Shot, voice-over and music assets by id. */
  assets: Record<string, EditorAsset>;
  /** Brand logo URLs by logo role, for the preview's logo layer. */
  logoUrls: Record<string, string>;
  /** Caption cues of the voice-over asset, when a track exists. */
  cues: EditorCue[];
  statuses: RenderStatus[];
  acceptance: AcceptanceStatus[];
  issues: CreativeIssue[];
  voices: EditorVoice[];
  /** Whether "Regenerate this shot" can run at all in this deployment. */
  regenEnabled: boolean;
  /** Take lengths the routed video model accepts (e.g. [5, 10]) — drives the
      target-length planner, never shown as the content length itself. */
  takeSeconds: number[];
};

import type { Brief } from "@/lib/ai/generator/types";

/** A connected channel as the brief form sees it. Limits come from the channel itself. */
export type GeneratorChannel = {
  id: string;
  provider: string;
  kind: string;
  network: string;
  networkLabel: string;
  name: string;
  /** True only when we have that network's ad fields AND the channel has ads access. */
  adCapable: boolean;
  textMax: number | null;
  hashtagsMax: number | null;
};

export type SavedBriefView = { id: string; name: string; brief: Brief };

export type GeneratorProps = {
  workspaceId: string;
  channels: GeneratorChannel[];
  savedBriefs: SavedBriefView[];
  /** Image generation is configured on the server; the button is hidden when it isn't. */
  imagesEnabled: boolean;
  /** What one generated image costs, already formatted, or null when unpriced. */
  imageEstimate: string | null;
  /** What the brand kit contributes to this run — stated, never implied. */
  brand: { configured: boolean; styled: boolean };
};

export const emptyBrief = (channels: GeneratorChannel[]): Brief => ({
  goal: "engagement",
  topic: "",
  keyPoints: [""],
  audience: "",
  offer: "",
  tone: "",
  channels: channels.slice(0, 1).map((c) => c.id),
  count: 3,
  includeAds: false,
  language: "",
});

/** Strips the blanks the form keeps for editing convenience. */
export const cleanBrief = (b: Brief): Brief => ({
  ...b,
  topic: b.topic.trim(),
  keyPoints: b.keyPoints.map((k) => k.trim()).filter(Boolean),
  audience: b.audience?.trim() || undefined,
  offer: b.offer?.trim() || undefined,
  tone: b.tone?.trim() || undefined,
  language: b.language?.trim() || undefined,
});

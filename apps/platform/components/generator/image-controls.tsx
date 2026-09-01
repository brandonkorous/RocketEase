"use client";

import { Button } from "@wizeworks/silicaui-react";
import { useState } from "react";
import type { ImageAspect } from "@/lib/ai/generator/image-spec";
import type { GeneratorApi } from "./use-generator";

/**
 * The aspect a generated image is actually rendered at.
 *
 * This used to be hardcoded to square, so every concept image came back 1:1
 * however it was going to be published — and the placement geometry in
 * lib/media/canvas/specs.ts, safe zones and all, was unreachable from the only
 * surface that generates one. A feed post is square; a Reel or a Story is 9:16
 * and looks wrong cropped from a square.
 */
const ASPECTS: { key: ImageAspect; label: string; hint: string }[] = [
  { key: "square", label: "1:1", hint: "Square — feed posts" },
  { key: "portrait", label: "9:16", hint: "Portrait — Reels, Stories, TikTok" },
  { key: "landscape", label: "16:9", hint: "Landscape — YouTube, link previews" },
];

type Props = {
  api: GeneratorApi;
  conceptId: string;
  /** What one image costs, already formatted. Null when no rate is configured. */
  estimate: string | null;
  onGenerate: (aspect: ImageAspect) => void;
};

export function ImageControls({ api, conceptId, estimate, onGenerate }: Props) {
  const [aspect, setAspect] = useState<ImageAspect>("square");
  const busy = api.busy === `${conceptId}:image`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Image shape">
        {ASPECTS.map((a) => (
          <Button
            key={a.key}
            size="xs"
            variant={aspect === a.key ? "solid" : "ghost"}
            color="neutral"
            disabled={busy}
            aria-pressed={aspect === a.key}
            title={a.hint}
            onClick={() => setAspect(a.key)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="ghost" color="neutral" disabled={busy} onClick={() => onGenerate(aspect)}>
        {busy ? "Generating image…" : "Generate image"}
      </Button>
      {/* Spend is stated BEFORE the button is pressed, not discovered afterwards. */}
      {estimate && <span className="text-xs text-secondary/70">{estimate}</span>}
    </div>
  );
}

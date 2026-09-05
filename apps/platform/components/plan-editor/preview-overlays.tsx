"use client";

/*
 * The overlay layer of the preview (M12.6 WP2) — the renderer's OWN resolver
 * and layout, in the browser: resolveRenderSpec has already turned the plan
 * into pixel type and hex, and layoutOverlays stacks anchor groups exactly the
 * way the compositor does. The one divergence is measurement — the renderer
 * measures with Pango, the browser with the DOM — so this measures rendered
 * spans (two passes) rather than estimating, and the frame labels the preview
 * as an approximation anyway.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { layoutOverlays, type PlacedItem } from "@/lib/media/compose/layout";
import type { RenderSpec } from "@/lib/media/compose/spec";
import type { Rect } from "@/lib/media/canvas/geometry";

const WEIGHTS = { regular: 400, medium: 500, bold: 700 } as const;

type Props = { spec: RenderSpec; scale: number; logoUrls: Record<string, string> };

/** One overlay's visual, reused by the measuring pass and the placed pass. */
function OverlayBody({ spec, scale, id, logoUrls }: Props & { id: string }) {
  const text = spec.texts.find((t) => t.id === id);
  if (text) {
    const pad = Math.round(text.fontSizePx * scale * 0.35);
    return (
      <span
        style={{
          display: "inline-block",
          fontFamily: text.fontFamily ? `${text.fontFamily}, Inter, sans-serif` : undefined,
          fontWeight: WEIGHTS[text.fontWeight],
          fontSize: text.fontSizePx * scale,
          lineHeight: 1.15,
          color: text.colorHex,
          textAlign: text.align,
          maxWidth: text.maxWidthPx * scale,
          ...(text.backdrop === "box" ? { backgroundColor: text.backdropHex, padding: `${pad * 0.5}px ${pad}px` } : {}),
          ...(text.backdrop === "scrim" ? { textShadow: `0 0 ${pad * 2}px ${text.backdropHex}, 0 0 ${pad}px ${text.backdropHex}` } : {}),
        }}
      >
        {text.text}
      </span>
    );
  }
  const logo = spec.logos.find((l) => l.id === id);
  if (!logo) return null;
  const url = (logo.locator.kind === "object" ? logoUrls[logo.locator.storageKey] : undefined) ?? Object.values(logoUrls)[0];
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Brand logo" style={{ width: logo.boxWidthPx * scale, height: "auto" }} />;
}

export function PreviewOverlays({ spec, scale, logoUrls }: Props) {
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<PlacedItem[]>([]);
  const ids = [...spec.logos.map((l) => l.id), ...spec.texts.map((t) => t.id)];
  const anchors = new Map([...spec.logos.map((l) => [l.id, l.anchor] as const), ...spec.texts.map((t) => [t.id, t.anchor] as const)]);

  // Pass 1 renders invisibly and measures; pass 2 places with the real layout.
  useLayoutEffect(() => {
    const host = measureRef.current;
    if (!host) return;
    const items = ids
      .map((id) => {
        const el = host.querySelector<HTMLElement>(`[data-overlay-id="${id}"]`);
        const anchor = anchors.get(id);
        if (!el || !anchor) return null;
        return { id, anchor, size: { width: el.offsetWidth, height: el.offsetHeight } };
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);
    const area: Rect = { x: spec.safe.x * scale, y: spec.safe.y * scale, width: spec.safe.width * scale, height: spec.safe.height * scale };
    setPlaced(layoutOverlays(items, area, spec.gutter * scale));
    // Re-measure whenever anything that reaches pixels changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(spec), scale]);

  return (
    <>
      <div ref={measureRef} aria-hidden style={{ position: "absolute", inset: 0, visibility: "hidden", pointerEvents: "none" }}>
        {ids.map((id) => (
          <div key={id} data-overlay-id={id} style={{ position: "absolute", left: 0, top: 0 }}>
            <OverlayBody spec={spec} scale={scale} id={id} logoUrls={logoUrls} />
          </div>
        ))}
      </div>
      {placed.map((p) => (
        <div key={p.id} style={{ position: "absolute", left: p.rect.x, top: p.rect.y, width: p.rect.width }}>
          <OverlayBody spec={spec} scale={scale} id={p.id} logoUrls={logoUrls} />
        </div>
      ))}
    </>
  );
}

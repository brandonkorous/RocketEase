/*
 * ASS subtitles — what actually gets burned into the pixels.
 *
 * Social video autoplays muted and almost no network accepts a sidecar over its
 * API, so burned-in captions are the default rather than the fallback. ffmpeg's
 * `subtitles=` filter renders these through libass, which is in the media
 * worker image (verified: --enable-libass --enable-libfontconfig).
 *
 * The reason this file exists rather than a drawtext filtergraph: ASS carries
 * its own style block, so ONE filter renders every cue, and the vertical margin
 * is a number. That number comes from the placement's safe zone — which means
 * burned-in captions sit clear of the Reels UI **by construction**, the same
 * property the ad compositor gets from owning its overlays.
 */
import type { CanvasSpec } from "@/lib/media/canvas/specs";
import type { Cue } from "./cues";

/** ASS colours are &HAABBGGRR — BGR order, and alpha is INVERTED (00 = opaque). */
export function assColour(hex: string, alpha = 0): string {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
  const [r, g, b] = [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)];
  return `&H${Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
}

export type CaptionStyle = {
  fontFamily: string;
  /** Cap height in pixels at the video's own resolution. */
  fontSizePx: number;
  textHex: string;
  outlineHex: string;
  /** `outline` reads on any footage; `box` is a solid plate behind the words. */
  border: "outline" | "box";
  outlinePx: number;
  /** Pixels from the bottom of the frame. Set from the safe zone, not by taste. */
  marginBottomPx: number;
  marginSidePx: number;
  bold: boolean;
};

/**
 * A style that respects the placement. `marginBottomPx` is the safe-zone bottom
 * inset, so on Reels the captions clear the 35% band the platform draws over.
 */
export function styleForPlacement(spec: CanvasSpec, over: Partial<CaptionStyle> = {}): CaptionStyle {
  const short = Math.min(spec.width, spec.height);
  return {
    fontFamily: "",
    fontSizePx: Math.round(short * 0.045),
    textHex: "#ffffff",
    outlineHex: "#000000",
    border: "outline",
    outlinePx: Math.max(2, Math.round(short * 0.004)),
    marginBottomPx: Math.round(spec.height * spec.safeZone.bottom),
    marginSidePx: Math.round(spec.width * spec.safeZone.left),
    bold: true,
    ...over,
  };
}

/** ASS is line-oriented: a literal comma or newline in a field corrupts the file. */
export const escapeAss = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");

const styleLine = (s: CaptionStyle) =>
  [
    "Style: Default",
    s.fontFamily || "sans",
    s.fontSizePx,
    assColour(s.textHex),
    assColour(s.textHex),
    assColour(s.outlineHex),
    // BackColour doubles as the box fill when BorderStyle is 3.
    assColour(s.outlineHex, s.border === "box" ? 40 : 0),
    s.bold ? -1 : 0,
    0, 0, 0,          // Italic, Underline, StrikeOut
    100, 100,         // ScaleX, ScaleY
    0, 0,             // Spacing, Angle
    s.border === "box" ? 3 : 1,
    s.outlinePx,
    0,                // Shadow — flat, so it renders identically every time
    2,                // Alignment: bottom centre
    s.marginSidePx, s.marginSidePx, s.marginBottomPx,
    1,                // Encoding
  ].join(",");

/** `H:MM:SS.cc` — ASS keeps CENTISECONDS, not milliseconds. */
export function assTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor(t / 60_000) % 60;
  const s = Math.floor(t / 1000) % 60;
  const cs = Math.round((t % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export type AssInput = { cues: Cue[]; style: CaptionStyle; width: number; height: number };

/**
 * PlayResX/PlayResY MUST match the video, or libass scales the margins and the
 * safe-zone guarantee quietly stops being true.
 */
export function toAss(input: AssInput): string {
  const events = input.cues
    .map((c) => `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Default,,0,0,0,,${escapeAss(c.lines.join("\n"))}`)
    .join("\n");

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${input.width}`,
    `PlayResY: ${input.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    styleLine(input.style),
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    events,
    "",
  ].join("\n");
}

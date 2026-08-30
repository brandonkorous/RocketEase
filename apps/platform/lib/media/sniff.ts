/*
 * What a file actually is, read from its bytes.
 *
 * Generalises the sniff already in lib/ai/generator/images.ts, and for the same
 * stated reason: trust the bytes, not a header we did not ask for. A vendor that
 * labels an MP4 as `video/quicktime` must not put the wrong mime type on an
 * asset a network will later reject.
 */
import type { AssetKind } from "@/db/schema/assets";

export type Sniffed = { mimeType: string; extension: string; kind: AssetKind };

const ascii = (b: Buffer, start: number, end: number) => (b.length >= end ? b.toString("ascii", start, end) : "");

/** Returns null for anything unrecognised — the caller refuses to store it. */
export function sniffContainer(b: Buffer): Sniffed | null {
  // Images
  if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG") return { mimeType: "image/png", extension: ".png", kind: "image" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return { mimeType: "image/jpeg", extension: ".jpg", kind: "image" };
  if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { mimeType: "image/webp", extension: ".webp", kind: "image" };
  if (b.length > 6 && ascii(b, 0, 3) === "GIF") return { mimeType: "image/gif", extension: ".gif", kind: "image" };

  // Video / audio containers
  if (b.length > 12 && ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12);
    // M4A and friends are audio in an MP4 container; the brand is the only tell.
    if (brand.startsWith("M4A") || brand.startsWith("M4B")) return { mimeType: "audio/mp4", extension: ".m4a", kind: "audio" };
    return { mimeType: "video/mp4", extension: ".mp4", kind: "video" };
  }
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // Matroska/WebM: treated as video; an audio-only WebM is rare from a model.
    return { mimeType: "video/webm", extension: ".webm", kind: "video" };
  }
  if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE") return { mimeType: "audio/wav", extension: ".wav", kind: "audio" };
  if (b.length > 4 && ascii(b, 0, 4) === "OggS") return { mimeType: "audio/ogg", extension: ".ogg", kind: "audio" };
  if (b.length > 3 && ascii(b, 0, 3) === "ID3") return { mimeType: "audio/mpeg", extension: ".mp3", kind: "audio" };
  // Bare MPEG frame sync: 0xFF followed by 111x xxxx.
  if (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { mimeType: "audio/mpeg", extension: ".mp3", kind: "audio" };

  return null;
}

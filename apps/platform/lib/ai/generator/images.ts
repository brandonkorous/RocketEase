/*
 * Image generation adapter.
 *
 * The interface is what the rest of the app depends on; the OpenAI Images
 * implementation is env-gated and returns nothing at all when unconfigured, so
 * the UI can hide the button instead of offering a feature that cannot work.
 *
 * Request shape confirmed against OpenAI's own docs (2026-08-28):
 *   https://developers.openai.com/api/docs/guides/image-generation.md
 *   POST https://api.openai.com/v1/images/generations
 *   body  { model, prompt, n, size }         size: 1024x1024 | 1536x1024 | 1024x1536
 *   reply { data: [{ b64_json }] }           gpt-image models return base64, not URLs
 * No field is sent that those docs do not define.
 */
import "server-only";
import { log } from "@/lib/log";

export type ImageAspect = "square" | "portrait" | "landscape";
export type ImageOptions = { aspect: ImageAspect; count: number };
export type GeneratedImage = { bytes: Buffer; mimeType: string; extension: string };

/** What a concept card calls. Implementations return storage-backed asset ids. */
export interface ImageGenerator {
  readonly model: string;
  generate(prompt: string, opts: ImageOptions): Promise<{ assetIds: string[] } | { error: string }>;
}

export const IMAGES_UNCONFIGURED = "Image generation isn't configured.";
export const IMAGES_UNAVAILABLE = "The image service didn't respond. Try again in a moment.";
export const IMAGES_EMPTY = "The image service returned no image.";

export const imagesConfigured = () => Boolean(process.env.OPENAI_API_KEY && process.env.AI_IMAGE_MODEL);
export const imageModel = () => process.env.AI_IMAGE_MODEL ?? "";

/** Only sizes the API documents. An aspect we cannot map falls back to square. */
const SIZES: Record<ImageAspect, string> = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" };

export const MAX_IMAGES = 4;

/** Sniff the format from the bytes rather than trusting a header we didn't ask for. */
function sniff(bytes: Buffer): { mimeType: string; extension: string } | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") return { mimeType: "image/png", extension: ".png" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mimeType: "image/jpeg", extension: ".jpg" };
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mimeType: "image/webp", extension: ".webp" };
  return null;
}

type ImagesReply = { data?: { b64_json?: string }[] };

/** Raw call. Returns decoded images or a user-facing reason — never throws. */
export async function renderImages(prompt: string, opts: ImageOptions): Promise<{ images: GeneratedImage[] } | { error: string }> {
  if (!imagesConfigured()) return { error: IMAGES_UNCONFIGURED };
  const n = Math.min(Math.max(1, opts.count), MAX_IMAGES);
  const started = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: imageModel(), prompt, n, size: SIZES[opts.aspect] ?? SIZES.square }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      log.warn("image generation failed", { status: res.status, ms: Date.now() - started });
      return { error: res.status === 401 || res.status === 403 ? IMAGES_UNCONFIGURED : IMAGES_UNAVAILABLE };
    }
    const body = (await res.json()) as ImagesReply;
    const images = (body.data ?? []).flatMap((d) => {
      if (!d.b64_json) return [];
      const bytes = Buffer.from(d.b64_json, "base64");
      const kind = sniff(bytes);
      return kind ? [{ bytes, ...kind }] : [];
    });
    log.debug("image generation", { model: imageModel(), ms: Date.now() - started, images: images.length });
    return images.length ? { images } : { error: IMAGES_EMPTY };
  } catch (err) {
    log.warn("image generation errored", { ms: Date.now() - started, err });
    return { error: IMAGES_UNAVAILABLE };
  }
}

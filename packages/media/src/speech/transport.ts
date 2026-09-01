/*
 * The one Azure call this adapter makes.
 *
 *   POST /openai/deployments/{deployment}/audio/speech
 *
 * Deployment-in-the-PATH, unlike sora where the model travels in the body.
 * Three data planes, three shapes; that is why this is its own module rather
 * than a flag on another one.
 *
 * The response is the audio itself, not JSON — so an error has to be read
 * differently from a success, and a body that fails to parse as JSON on a
 * non-OK response is not a bug worth surfacing.
 */
import { MediaError } from "../types";

export const TIMEOUT_MS = 120_000;

export type SpeechConfig = { endpoint: string; apiKey: string; deployment: string; apiVersion: string };
export type SpeakInput = { input: string; voice: string; instructions?: string };

type ErrorBody = { error?: { message?: string; code?: string | null } };

export function errorFor(status: number, body: ErrorBody | null): MediaError {
  const code = body?.error?.code ?? undefined;
  const message = body?.error?.message ?? `The speech endpoint returned ${status}.`;
  if (status === 401 || status === 403) return new MediaError("The speech API key was rejected.", { category: "permission", vendorCode: code });
  if (status === 404) return new MediaError("No such speech deployment. Check the deployment name matches the model.", { category: "validation", vendorCode: code });
  if (status === 429) return new MediaError("The voice model is busy — try again in a minute.", { category: "rate_limit", vendorCode: code });
  if (status === 400) return new MediaError(message, { category: "validation", vendorCode: code });
  // A 5xx here is NOT ambiguous the way a video POST is: nothing was queued and
  // nothing is billing, so retrying is safe.
  if (status >= 500) return new MediaError("The speech service failed.", { category: "temporary", vendorCode: code });
  return new MediaError(message, { category: "unknown", vendorCode: code });
}

export async function speak(c: SpeechConfig, body: SpeakInput): Promise<Uint8Array> {
  const url = `${c.endpoint.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(c.deployment)}/audio/speech?api-version=${c.apiVersion}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "api-key": c.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: c.deployment,
      input: body.input,
      voice: body.voice,
      // mp3 rather than wav: this is muxed into an MP4 straight away, and a
      // 12-second wav at 24kHz is an order of magnitude larger for no gain.
      response_format: "mp3",
      ...(body.instructions ? { instructions: body.instructions } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw errorFor(res.status, (await res.json().catch(() => null)) as ErrorBody | null);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new MediaError("The speech endpoint returned no audio.", { category: "unknown" });
  return bytes;
}

/** Extension whisper will accept for a mime type, defaulting to the common one. */
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
};
export const extensionFor = (mimeType: string): string => AUDIO_EXTENSIONS[mimeType.split(";")[0].trim().toLowerCase()] ?? ".mp3";

/** The raw shape whisper's verbose_json returns. Seconds, not milliseconds. */
type WhisperResponse = {
  language?: string;
  text?: string;
  duration?: number;
  words?: { word?: string; start?: number; end?: number }[];
};

/**
 * Speech to text, on the SAME data plane and a DIFFERENT deployment.
 *
 * multipart, because the audio is a file part. `timestamp_granularities[]=word`
 * is what makes whisper return per-word start/end — without it the response
 * carries segments only, and a caption built from segments lands on the wrong
 * syllable.
 */
export async function transcribeAudio(
  c: SpeechConfig,
  deployment: string,
  body: { bytes: Uint8Array; mimeType: string; language?: string },
): Promise<WhisperResponse> {
  const url = `${c.endpoint.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${c.apiVersion}`;
  const form = new FormData();
  // The FILENAME matters: whisper sniffs the container from its extension and
  // answers 400 for a part called "audio" with no suffix, whatever the
  // Content-Type says. That cost a live run (docs/bugs/B-015).
  form.set("file", new Blob([body.bytes as BlobPart], { type: body.mimeType }), `audio${extensionFor(body.mimeType)}`);
  form.set("response_format", "verbose_json");
  form.set("timestamp_granularities[]", "word");
  if (body.language) form.set("language", body.language);

  const res = await fetch(url, { method: "POST", headers: { "api-key": c.apiKey }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw errorFor(res.status, (await res.json().catch(() => null)) as ErrorBody | null);
  return (await res.json()) as WhisperResponse;
}

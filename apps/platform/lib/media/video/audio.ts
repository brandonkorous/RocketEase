/*
 * The audio graph, as a string.
 *
 * Built as pure text so the filtergraph can be read and tested without encoding
 * anything — an ffmpeg filter chain is exactly the kind of thing that is wrong
 * in a way you only discover four minutes into a render.
 *
 * The mix, in order:
 *   1. the shots' own audio, at their own level
 *   2. a music bed, attenuated to `musicGainDb` (a bed sits UNDER, always)
 *   3. the bed DUCKED by the voice-over via sidechaincompress
 *   4. everything summed, then loudnorm to −14 LUFS
 *
 * Ducking is the step that decides whether a voice-over is intelligible. Without
 * it people do not turn the music down; they turn the video off.
 */

export type AudioInputs = {
  /** Stream label for the concatenated shots' audio, if any. */
  body?: string;
  voiceover?: string;
  music?: string;
};

export type AudioSettings = {
  duckDb: number;
  musicGainDb: number;
  targetLufs: number;
  /** Bed level under the shots when there is no voice-over to duck against. */
  bodyGainDb?: number;
};

/** dB → linear gain, which is what the `volume` filter wants. */
export const dbToLinear = (db: number): number => Number((10 ** (db / 20)).toFixed(6));

/**
 * `sidechaincompress` uses a ratio, not a dB reduction, so the plan's "duck by
 * 12 dB" has to become one. This is the standard relationship for a hard-knee
 * compressor at the threshold we set, and it is clamped to a sane band rather
 * than trusted blindly.
 */
export const duckRatio = (duckDb: number): number => Math.min(20, Math.max(1.5, Number((1 + duckDb / 2).toFixed(2))));

export type AudioGraph = { filter: string; outLabel: string } | { silent: true };

/**
 * Returns the filtergraph fragment and the label carrying the result, or
 * `{ silent: true }` when there is genuinely no audio — which is a fact worth
 * returning rather than a silent track worth pretending about.
 */
export function buildAudioGraph(inputs: AudioInputs, settings: AudioSettings): AudioGraph {
  const parts: string[] = [];
  const mixLabels: string[] = [];

  if (inputs.body) {
    const gain = settings.bodyGainDb ?? 0;
    if (gain !== 0) {
      parts.push(`[${inputs.body}]volume=${dbToLinear(gain)}[bodyv]`);
      mixLabels.push("bodyv");
    } else {
      mixLabels.push(inputs.body);
    }
  }

  if (inputs.music) {
    parts.push(`[${inputs.music}]volume=${dbToLinear(settings.musicGainDb)}[bed]`);
    if (inputs.voiceover) {
      // The bed is compressed BY the voice: the voice is the sidechain key, and
      // `apad` keeps the key alive to the end so the compressor does not stall.
      parts.push(`[${inputs.voiceover}]apad[vokey]`);
      parts.push(
        `[bed][vokey]sidechaincompress=threshold=0.03:ratio=${duckRatio(settings.duckDb)}:attack=20:release=350:makeup=1[ducked]`,
      );
      mixLabels.push("ducked");
    } else {
      mixLabels.push("bed");
    }
  }

  if (inputs.voiceover) mixLabels.push(inputs.voiceover);

  if (!mixLabels.length) return { silent: true };

  if (mixLabels.length === 1) {
    parts.push(`[${mixLabels[0]}]loudnorm=I=${settings.targetLufs}:TP=-1.5:LRA=11[aout]`);
  } else {
    // `duration=longest` and `normalize=0`: amix's default halves every input's
    // level, which quietly makes a mixed track much quieter than a single one.
    parts.push(`${mixLabels.map((l) => `[${l}]`).join("")}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[mixed]`);
    parts.push(`[mixed]loudnorm=I=${settings.targetLufs}:TP=-1.5:LRA=11[aout]`);
  }

  return { filter: parts.join(";"), outLabel: "aout" };
}

export const isSilent = (g: AudioGraph): g is { silent: true } => "silent" in g;

/**
 * Scale and crop to fill the canvas without distortion, then pin the frame rate,
 * pixel format and sample aspect. Every shot goes through this identically —
 * that is what makes the concat demuxer legal.
 */
export function videoNormalizeFilter(width: number, height: number, fps: number): string {
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `fps=${fps}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
}

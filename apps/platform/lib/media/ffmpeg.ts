/*
 * The one place that runs ffmpeg/ffprobe, and the one place that decides they
 * are unavailable.
 *
 * No `fluent-ffmpeg`: a direct spawn is fewer moving parts and a predictable
 * failure mode. No `server-only`: the worker is the main caller.
 *
 * Unavailable is NOT "fine". A caller that cannot probe must record unknown and
 * say why — never a zero, never a pretend pass. That is the same rule
 * lib/tracking/availability.ts follows for missing metrics.
 */
import { spawn } from "node:child_process";
import { log } from "@/lib/log";

export const FFMPEG_UNAVAILABLE = "ffmpeg isn't installed on this worker, so media couldn't be inspected.";
export const FFPROBE_UNAVAILABLE = "ffprobe isn't installed on this worker, so duration and dimensions are unknown.";

export const ffmpegPath = () => process.env.FFMPEG_PATH || "ffmpeg";
export const ffprobePath = () => process.env.FFPROBE_PATH || "ffprobe";

/** Default ceiling for one tool run. A runaway render must die, not drain the node. */
export const DEFAULT_TIMEOUT_MS = 120_000;

export class MediaToolError extends Error {
  readonly missing: boolean;
  readonly code: number | null;
  readonly stderr: string;
  constructor(message: string, opts: { missing?: boolean; code?: number | null; stderr?: string }) {
    super(message);
    this.name = "MediaToolError";
    this.missing = opts.missing ?? false;
    this.code = opts.code ?? null;
    this.stderr = opts.stderr ?? "";
  }
}

export type RunResult = { stdout: Buffer; stderr: string };

/**
 * Run a media tool to completion. Rejects with MediaToolError; `missing` marks
 * "the binary is not here", which callers treat as unknown rather than failure.
 */
export function run(bin: string, args: string[], opts: { timeoutMs?: number; input?: Buffer } = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new MediaToolError(`${bin} timed out after ${timeoutMs}ms`, { stderr: err }));
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => out.push(c));
    // Bounded: ffmpeg is chatty and a long render must not accumulate megabytes.
    child.stderr.on("data", (c: Buffer) => {
      if (err.length < 8192) err += c.toString();
    });

    child.on("error", (e: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const missing = e.code === "ENOENT";
      reject(new MediaToolError(missing ? `${bin} is not installed` : `${bin} failed to start: ${e.message}`, { missing, stderr: err }));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout: Buffer.concat(out), stderr: err });
      reject(new MediaToolError(`${bin} exited with ${code}`, { code, stderr: err.slice(0, 2000) }));
    });

    if (opts.input) {
      child.stdin.on("error", () => {}); // the tool may close stdin early; not our problem
      child.stdin.end(opts.input);
    }
  });
}

let available: { ffmpeg: boolean; ffprobe: boolean } | null = null;

/** Cached per process: the binaries do not appear mid-run. */
export async function toolsAvailable(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  if (available) return available;
  const probe = async (bin: string) => {
    try {
      await run(bin, ["-version"], { timeoutMs: 10_000 });
      return true;
    } catch (err) {
      if (err instanceof MediaToolError && err.missing) return false;
      log.warn("media tool check failed", { bin, err });
      return false;
    }
  };
  available = { ffmpeg: await probe(ffmpegPath()), ffprobe: await probe(ffprobePath()) };
  if (!available.ffprobe) log.warn("ffprobe unavailable; media duration and dimensions will be recorded as unknown");
  return available;
}

/** Test seam. */
export const __resetToolCache = () => {
  available = null;
};

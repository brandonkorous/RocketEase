/*
 * Product telemetry (5.8). `track()` never throws and never blocks the caller
 * on failure: a missing table (migration pending) or a DB blip is logged once
 * per process and the event is dropped. Props are allow-listed scalars only.
 */
import { db } from "@/db";
import { productEvent, type ProductEventName } from "@/db/schema/telemetry";
import { log } from "./log";

export const TELEMETRY_SCHEMA_VERSION = 1;

type Scalar = string | number | boolean | null;
export type TrackInput = {
  userId?: string | null;
  organizationId?: string | null;
  workspaceId?: string | null;
  /** Route, action, or job name. Defaults to the process kind. */
  surface?: string;
  outcome?: "ok" | "error" | "denied";
  latencyMs?: number;
  props?: Record<string, Scalar | undefined>;
};

const FORBIDDEN = /text|body|message|token|secret|email|password|caption/i;
let warned = false;

/** Drop anything that looks like content or a credential; keep short scalars. */
function sanitize(props: TrackInput["props"]): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || FORBIDDEN.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 64);
    else out[k] = v;
  }
  return out;
}

export async function track(event: ProductEventName, input: TrackInput = {}): Promise<void> {
  try {
    await db.insert(productEvent).values({
      event,
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      workspaceId: input.workspaceId ?? null,
      surface: input.surface ?? (process.env.MIS_PROCESS ?? "web"),
      outcome: input.outcome ?? "ok",
      latencyMs: input.latencyMs ?? null,
      props: sanitize(input.props),
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
    });
  } catch (err) {
    if (!warned) log.warn("telemetry write failed (dropping events until next process start)", { event, err });
    warned = true;
  }
}

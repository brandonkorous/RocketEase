/*
 * Allowance and hard cap. Product rule: no surprise bills — the cap is refused
 * at, not warned about. Until billing lands the plan lives in
 * `workspace.settings.ai`; the billing agent replaces `readAiLimits` only.
 */
import { formatInZone } from "@/lib/time";
import { roundCredits } from "./credits";

export const DEFAULT_AI_ALLOWANCE_CREDITS = 200;
/** A cap that isn't set is three times the allowance. */
export const AI_CAP_MULTIPLIER = 3;

export type AiLimits = { allowanceCredits: number; capCredits: number };
export type AiBudget = { allowed: boolean; used: number; allowance: number; cap: number; remaining: number; resetsAt: Date; timezone: string };

type WorkspaceLike = { settings?: Record<string, unknown> | null };

const credits = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Tolerant read: a hand-edited settings blob must never take AI offline. */
export function readAiLimits(settings: Record<string, unknown> | null | undefined): AiLimits {
  const raw = ((settings ?? {}).ai ?? {}) as Record<string, unknown>;
  const allowanceCredits = credits(raw.allowanceCredits) ?? DEFAULT_AI_ALLOWANCE_CREDITS;
  const configuredCap = credits(raw.capCredits);
  return { allowanceCredits, capCredits: Math.max(allowanceCredits, configuredCap ?? allowanceCredits * AI_CAP_MULTIPLIER) };
}

export const allowanceFor = (ws: WorkspaceLike) => readAiLimits(ws.settings).allowanceCredits;
export const capFor = (ws: WorkspaceLike) => readAiLimits(ws.settings).capCredits;

export function budgetFrom(input: { used: number; limits: AiLimits; resetsAt: Date; timezone: string }): AiBudget {
  const used = roundCredits(input.used);
  const { allowanceCredits: allowance, capCredits: cap } = input.limits;
  return { allowed: used < cap, used, allowance, cap, remaining: roundCredits(Math.max(0, cap - used)), resetsAt: input.resetsAt, timezone: input.timezone };
}

export function aiCapMessage(resetsAt: Date, timezone: string): string {
  return `This workspace has used its AI credits for the month. Credits reset on ${formatInZone(resetsAt, timezone, { dateStyle: "long" })}.`;
}

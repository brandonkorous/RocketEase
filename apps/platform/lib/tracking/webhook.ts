/*
 * Generic conversion webhook — for pixels and CRMs we do not integrate directly.
 *
 *   POST /api/webhooks/tracking/{sourceId}
 *   x-rke-timestamp: <unix seconds>
 *   x-rke-signature: sha256=<hex HMAC of "{timestamp}.{rawBody}">
 *
 * The timestamp is inside the signed material and must be recent, so a captured
 * request cannot be replayed later. Each event carries an id (or gets one from
 * the body hash) and is deduped in `conversion_event`; the day's fact is
 * recomputed from that ledger, never incremented in place.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { z } from "zod";
import { cleanDimension, dimensionHash, isDay, type ConversionRow } from "./normalize";
import type { ConversionDimension } from "@/db/schema/tracking";

export const SIGNATURE_HEADER = "x-rke-signature";
export const TIMESTAMP_HEADER = "x-rke-timestamp";
export const MAX_SKEW_SECONDS = 300;

export const newWebhookSecret = () => `rke_whsec_${randomBytes(24).toString("base64url")}`;

export const signPayload = (secret: string, timestamp: string, rawBody: string) => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;

const constantTimeEqual = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

export type VerifyResult = { ok: true } | { ok: false; reason: "missing_signature" | "stale_timestamp" | "bad_signature" };

export function verifyWebhook(input: { secret: string; rawBody: string; signature?: string | null; timestamp?: string | null; nowSeconds?: number }): VerifyResult {
  const { secret, rawBody, signature, timestamp } = input;
  if (!signature || !timestamp) return { ok: false, reason: "missing_signature" };
  const ts = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale_timestamp" };
  return constantTimeEqual(signPayload(secret, timestamp, rawBody), signature) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

const eventSchema = z.object({
  eventId: z.string().trim().min(1).max(200).optional(),
  occurredAt: z.string().trim().min(1),
  /** Monetary value of the conversion; omit for a value-less conversion. */
  value: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  /** How many conversions this event represents; defaults to 1. */
  count: z.number().int().positive().max(10_000).optional(),
  utm_source: z.string().trim().max(200).optional(),
  utm_medium: z.string().trim().max(200).optional(),
  utm_campaign: z.string().trim().max(200).optional(),
});
/** A sender may post one event or a batch. */
const bodySchema = z.union([eventSchema, z.object({ events: z.array(eventSchema).min(1).max(500) })]);

export type ParsedEvent = { eventId: string; occurredAt: Date; day: string; value: number; count: number; currency?: string; dimension: ConversionDimension; dimensionHash: string };
export type ParseResult = { ok: true; events: ParsedEvent[] } | { ok: false; error: string };

const hashBody = (rawBody: string, index: number) => `body:${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}:${index}`;

/** Validate and normalize a signed body into ledger-ready events. */
export function parseWebhookBody(rawBody: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "Body is not valid JSON." };
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Unexpected payload shape." };
  const list = "events" in parsed.data ? parsed.data.events : [parsed.data];
  const events: ParsedEvent[] = [];
  for (const [i, e] of list.entries()) {
    const occurredAt = new Date(e.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: `occurredAt "${e.occurredAt}" is not a date.` };
    const day = occurredAt.toISOString().slice(0, 10);
    if (!isDay(day)) return { ok: false, error: "occurredAt did not resolve to a calendar day." };
    const dimension = cleanDimension(e);
    events.push({
      eventId: e.eventId ?? hashBody(rawBody, i),
      occurredAt,
      day,
      value: e.value ?? 0,
      count: e.count ?? 1,
      currency: e.currency?.toUpperCase(),
      dimension,
      dimensionHash: dimensionHash(dimension),
    });
  }
  return { ok: true, events };
}

/** Ledger rows for one day range → daily conversion/revenue rows. */
export function eventsToRows(events: { day: string; count: number; value: number; currency: string | null; dimension: ConversionDimension; dimensionHash: string }[]): ConversionRow[] {
  const acc = new Map<string, { day: string; dimension: ConversionDimension; currency?: string; count: number; revenue: number }>();
  for (const e of events) {
    const key = `${e.day}|${e.dimensionHash}`;
    const entry = acc.get(key) ?? { day: e.day, dimension: e.dimension, currency: e.currency ?? undefined, count: 0, revenue: 0 };
    entry.count += e.count;
    entry.revenue += e.value;
    if (!entry.currency && e.currency) entry.currency = e.currency;
    acc.set(key, entry);
  }
  const rows: ConversionRow[] = [];
  for (const e of acc.values()) {
    rows.push({ day: e.day, metric: "conversions", value: e.count, dimension: e.dimension, source: "webhook.event" });
    if (e.revenue) rows.push({ day: e.day, metric: "revenue", value: Math.round(e.revenue * 100) / 100, currency: e.currency, dimension: e.dimension, source: "webhook.event.value" });
  }
  return rows;
}

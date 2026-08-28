/*
 * TikTok developer webhooks. Signature header `TikTok-Signature: t=<unix>,s=<hex>`
 * is HMAC-SHA256(client_secret, `${t}.${rawBody}`). Events cover publish
 * status and authorization changes — there are no comment/DM events, so
 * inboxItemsFromWebhook always returns null.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProviderConfig, WebhookEvent } from "../types";

type Body = { client_key?: string; event?: string; create_time?: number; user_openid?: string; content?: string };

const MAX_SKEW_SECONDS = 5 * 60;

export function verifyTikTokWebhook(cfg: ProviderConfig, headers: Record<string, string>, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const header = headers["tiktok-signature"] ?? headers["TikTok-Signature"];
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.s || !Number.isFinite(t) || Math.abs(nowSeconds - t) > MAX_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", cfg.clientSecret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(parts.s, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseTikTokWebhook(rawBody: string): WebhookEvent[] {
  const body = JSON.parse(rawBody) as Body;
  if (!body.event) return [];
  let content: unknown = body.content;
  try {
    content = body.content ? JSON.parse(body.content) : undefined;
  } catch {
    /* keep raw string */
  }
  const at = body.create_time ? new Date(body.create_time * 1000).toISOString() : new Date().toISOString();
  const publishId = (content as { publish_id?: string } | undefined)?.publish_id;
  return [{ eventId: `${body.user_openid ?? "?"}:${body.event}:${publishId ?? body.create_time ?? ""}`, channelRemoteId: body.user_openid, kind: `tiktok.${body.event}`, occurredAt: at, payload: content }];
}

import { createHmac } from "node:crypto";
import type { Capabilities, ProviderConfig } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, form, httpJson } from "../http";

export const API = "https://graph.facebook.com/v21.0";
export const now = () => new Date().toISOString();

export type GraphError = { error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string } };

/** Map Graph error codes onto the shared taxonomy (integrations.md "Publishing and replies"). */
export function mapGraphError(status: number, body: GraphError, ambiguous = false): ProviderError {
  const e = body?.error;
  const code = e?.code;
  let category = categoryFromStatus(status);
  if (code === 190 || code === 102 || code === 10 || (code === 200 && status === 403)) category = "permission";
  if (code === 4 || code === 17 || code === 32 || code === 613) category = "rate_limit";
  if (code === 100 && status === 400) category = "validation";
  if (code === 1 || code === 2) category = "temporary";
  if (code === 368) category = "policy";
  const providerCode = code !== undefined ? `${code}${e?.error_subcode ? `/${e.error_subcode}` : ""}` : undefined;
  return new ProviderError(e?.message ?? `Meta API error (${status})`, { category, providerCode, ambiguous, retryAfterSeconds: category === "rate_limit" ? 300 : undefined });
}

type Init = { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string | undefined> };

/** Graph call with appsecret_proof; mutating 5xx responses are flagged ambiguous. */
export async function graph<T>(path: string, cfg: ProviderConfig, token: string, init: Init = {}): Promise<T> {
  const params = { ...(init.params ?? {}), access_token: token, appsecret_proof: createHmac("sha256", cfg.clientSecret).update(token).digest("hex") };
  const method = init.method ?? "GET";
  const url = method === "GET" ? `${API}${path}?${form(params)}` : `${API}${path}`;
  const res = await httpJson<T & GraphError>(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : form(params),
    timeoutMs: method === "GET" ? 20_000 : 60_000,
  });
  if (res.status >= 400 || (res.body as GraphError)?.error) throw mapGraphError(res.status, res.body as GraphError, method !== "GET" && res.status >= 500);
  return res.body;
}

export const IG_CAPS = (): Capabilities => ({
  formats: ["image", "carousel", "video", "reel", "story"],
  scheduling: "internal",
  limits: { textMaxChars: 2200, imagesMax: 10, videoMaxSeconds: 900, hashtagsMax: 30, mentions: true, firstComment: true, links: "none", altText: true, imageMaxBytes: 8 * 1024 * 1024, videoMaxBytes: 1024 * 1024 * 1024 },
  inbox: { comments: true, mentions: true, messages: true, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: true, manage: false },
  ingestion: { webhooks: true, polling: true },
  reasons: { links: "Instagram captions don't render clickable links.", ads: "Boosting Instagram media needs an Instagram actor on the ad account; manage it from Meta Ads Manager for now." },
  checkedAt: now(),
});

export const FB_CAPS = (): Capabilities => ({
  formats: ["text", "image", "carousel", "video", "reel"],
  scheduling: "native",
  limits: { textMaxChars: 63_206, imagesMax: 10, videoMaxSeconds: 14_400, mentions: true, firstComment: true, links: "inline", altText: true, videoMaxBytes: 10 * 1024 * 1024 * 1024 },
  // Page ratings/recommendations are not ingested yet; declaring false keeps the capability table honest.
  inbox: { comments: true, mentions: true, messages: true, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: true, manage: true },
  ingestion: { webhooks: true, polling: true },
  reasons: { reviews: "Facebook Page recommendations aren't imported yet." },
  checkedAt: now(),
});

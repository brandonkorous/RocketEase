/*
 * Pinterest API v5 client. One host (api.pinterest.com/v5); errors come back as
 * { code, message } alongside a meaningful HTTP status. A "channel" here is a
 * BOARD — pins are always created on a board, so the board is the unit the user
 * selects, and every board of the connected account shares one credential.
 */
import type { Capabilities, Credential } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, httpJson } from "../http";
import { retryAfterSeconds } from "../health";
import { INBOX, INBOX_REASONS } from "./inbox";

export const API = "https://api.pinterest.com/v5";
export const OAUTH_AUTH = "https://www.pinterest.com/oauth/";
export const now = () => new Date().toISOString();
export const pinUrl = (id: string) => `https://www.pinterest.com/pin/${id}/`;

export const SCOPES = {
  boards: ["boards:read", "boards:write"],
  pins: ["pins:read", "pins:write"],
  account: ["user_accounts:read"],
};

/** Documented v5 limits. Title/alt text are checked in publish.ts (the generic validator has no field for them). */
export const LIMITS = { title: 100, description: 800, altText: 500, carouselMin: 2, carouselMax: 5 };

const BASE_REASONS: Record<string, string> = {
  ...INBOX_REASONS,
  webhooks: "Pinterest API v5 publishes no webhooks for organic pins; everything is polled.",
  ads: "The Pinterest Ads API is a separate product this adapter does not integrate.",
  mentions: "Pinterest API v5 has no mentions endpoint.",
  disclosure: "Pinterest API v5 has no AI-content parameter on pin creation; the label goes in the pin description.",
};

const LIMIT_BLOCK = {
  textMaxChars: LIMITS.description,
  imagesMax: LIMITS.carouselMax,
  videoMaxSeconds: 15 * 60,
  videoMaxBytes: 2 * 1024 * 1024 * 1024,
  imageMaxBytes: 20 * 1024 * 1024,
  mentions: false,
  firstComment: false,
  links: "attached" as const,
  altText: true,
};

/**
 * Board channel: the unit a pin is published to. Pinterest reports analytics
 * for the WHOLE ACCOUNT and never per board, so a board carries pin-level
 * facts only — account series live on the `pinterest_account` channel, where
 * they are counted once instead of once per board.
 */
export function boardCaps(cred: Credential): Capabilities {
  const has = (list: string[]) => list.every((s) => cred.scopes.includes(s));
  const reasons: Record<string, string> = {
    ...BASE_REASONS,
    audience: "Pinterest reports impressions, saves and clicks for the whole account, not per board; account-level series are imported once on the account channel.",
  };
  if (!has(SCOPES.pins)) reasons.formats = "Creating pins needs the pins:write scope.";
  return {
    formats: has(SCOPES.pins) ? ["image", "video", "carousel"] : [],
    scheduling: "internal",
    limits: LIMIT_BLOCK,
    inbox: INBOX,
    insights: { organic: true, audience: false },
    ads: { import: false, manage: false },
    ingestion: { webhooks: false, polling: true },
    disclosure: "caption",
    reasons,
    checkedAt: now(),
  };
}

/** Account channel: analytics and followers only — a pin always needs a board. */
export function accountCaps(cred: Credential): Capabilities {
  const organic = cred.scopes.includes("user_accounts:read");
  return {
    ...boardCaps(cred),
    formats: [],
    insights: { organic, audience: organic },
    reasons: {
      ...BASE_REASONS,
      formats: "Pins are published to a board, so publishing is offered on the board channels rather than the account.",
      ...(organic ? {} : { insights: "Account analytics need the user_accounts:read scope." }),
      audience: "Pinterest account analytics require the connected account to be a Pinterest business account.",
    },
    checkedAt: now(),
  };
}

export type PinError = { code?: number; message?: string };

/** Pinterest error bodies carry a numeric `code`; the HTTP status is the reliable signal. */
export function mapPinterestError(status: number, body: PinError | string | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const b = typeof body === "string" || body === null ? { message: body ?? undefined } : body;
  let category = categoryFromStatus(status);
  if (status === 401) category = "permission";
  if (status === 403) category = "permission";
  if (status === 409) category = "validation";
  if (status === 429) category = "rate_limit";
  // v5 uses X-RateLimit-Reset (seconds remaining) rather than Retry-After.
  const reset = Number(opts.headers?.get("x-ratelimit-reset"));
  const fallback = Number.isFinite(reset) && reset > 0 ? Math.round(reset) : 60;
  const retryAfter = category === "rate_limit" ? retryAfterSeconds(opts.headers, fallback) : undefined;
  return new ProviderError(b.message ?? `Pinterest API error (${status})`, {
    category,
    providerCode: b.code !== undefined ? String(b.code) : undefined,
    ambiguous: opts.ambiguous ?? false,
    retryAfterSeconds: retryAfter,
  });
}

export type PinInit = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: Record<string, string | undefined> };

export async function pin<T>(path: string, token: string, init: PinInit = {}): Promise<{ body: T; headers: Headers }> {
  const method = init.method ?? "GET";
  const entries = Object.entries(init.query ?? {}).filter((e): e is [string, string] => e[1] !== undefined);
  const qs = entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
  const res = await httpJson<T & PinError>(`${API}${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    timeoutMs: method === "GET" ? 20_000 : 60_000,
  });
  if (res.status >= 400) throw mapPinterestError(res.status, res.body as PinError, { headers: res.headers, ambiguous: method !== "GET" && res.status >= 500 });
  return { body: res.body, headers: res.headers };
}

/** The token endpoint authenticates the CLIENT with HTTP Basic, not a bearer token. */
export const basicAuth = (clientId: string, clientSecret: string) => `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

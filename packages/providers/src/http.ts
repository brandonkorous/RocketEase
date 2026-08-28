import { ProviderError, type ErrorCategory } from "./types";

/*
 * Small fetch wrapper shared by adapters: timeouts, JSON, and error mapping
 * hooks. Adapters translate provider-specific error bodies into the
 * ProviderError taxonomy (integrations.md "Publishing and replies").
 */

export type HttpResult<T> = { status: number; body: T; headers: Headers };

export async function httpJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HttpResult<T>> {
  const { timeoutMs = 20_000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body: body as T, headers: res.headers };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    // A timeout on a mutating call is AMBIGUOUS: the provider may have acted.
    throw new ProviderError(aborted ? "Provider request timed out" : "Network error reaching provider", {
      category: "temporary",
      ambiguous: (rest.method ?? "GET").toUpperCase() !== "GET",
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function categoryFromStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403) return "permission";
  if (status === 404 || status === 410) return "deleted";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "temporary";
  return "unknown";
}

export const form = (data: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(data).filter((e): e is [string, string] => e[1] !== undefined)).toString();

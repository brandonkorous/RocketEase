/*
 * Thin REST client for the RocketEase public API. Every call carries the
 * workspace-scoped key; the server decides what that key may do.
 */
export type ClientOptions = { baseUrl: string; apiKey: string };

export class RkeApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RkeApiError";
    this.status = status;
    this.code = code;
  }
}

type RequestInput = {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  idempotencyKey?: string;
};

export class RkeClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
  }

  async request<T = unknown>({ method = "GET", path, query, body, idempotencyKey }: RequestInput): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}`, accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : null;
    if (!res.ok) {
      const err = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
      throw new RkeApiError(res.status, err?.code ?? "http_error", err?.message ?? `${res.status} ${res.statusText}`);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Client from the environment: RKE_API_URL (default localhost) + RKE_API_KEY. */
export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): RkeClient {
  const apiKey = env.RKE_API_KEY;
  if (!apiKey) throw new Error("RKE_API_KEY is not set. Create a key in RocketEase → Settings → API keys.");
  return new RkeClient({ baseUrl: env.RKE_API_URL ?? "http://localhost:5001/api/v1", apiKey });
}

/*
 * One error envelope for every /api/v1 route: { error: { code, message } }.
 * Codes are stable strings an agent can branch on; messages are for people.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "rate_limited"
  | "internal";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly headers: Record<string, string>;
  constructor(status: number, code: ApiErrorCode, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const unauthorized = (m: string) => new ApiError(401, "unauthorized", m, { "www-authenticate": 'Bearer realm="rke"' });
export const forbidden = (m: string) => new ApiError(403, "forbidden", m);
export const notFound = (m: string) => new ApiError(404, "not_found", m);
export const invalid = (m: string) => new ApiError(400, "invalid_request", m);
export const conflict = (m: string) => new ApiError(409, "conflict", m);

export function apiJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function apiErrorBody(code: ApiErrorCode, message: string) {
  return { error: { code, message } };
}

/** Single funnel: ApiError becomes the envelope, anything else a 500 that leaks nothing. */
export async function apiHandler(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return apiJson(apiErrorBody(e.code, e.message), e.status, e.headers);
    console.error("[api] unhandled", e);
    return apiJson(apiErrorBody("internal", "Internal error"), 500);
  }
}

/** Parses a JSON body or fails with the envelope rather than a framework error. */
export async function apiBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw invalid("Body must be JSON.");
  }
}

import { SCIM_CONTENT_TYPE, SCIM_SCHEMA } from "./constants";

/** RFC 7644 §3.12 error. `scimType` is the machine-readable detail an IdP keys off. */
export class ScimError extends Error {
  readonly status: number;
  readonly scimType?: string;
  constructor(status: number, detail: string, scimType?: string) {
    super(detail);
    this.name = "ScimError";
    this.status = status;
    this.scimType = scimType;
  }
}

export function scimJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": SCIM_CONTENT_TYPE, "cache-control": "no-store", ...headers },
  });
}

export function scimErrorBody(status: number, detail: string, scimType?: string) {
  return { schemas: [SCIM_SCHEMA.error], status: String(status), detail, ...(scimType ? { scimType } : {}) };
}

/**
 * Single funnel for every SCIM route: any ScimError becomes a spec error body,
 * anything else becomes a 500 without leaking the internal message.
 */
export async function scimHandler(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ScimError) {
      const headers: Record<string, string> = e.status === 401 ? { "www-authenticate": 'Bearer realm="scim"' } : {};
      return scimJson(scimErrorBody(e.status, e.message, e.scimType), e.status, headers);
    }
    console.error("[scim] unhandled", e);
    return scimJson(scimErrorBody(500, "Internal error"), 500);
  }
}

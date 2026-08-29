/*
 * Meta signed_request: the payload Meta POSTs to the deauthorize and
 * data-deletion callbacks. Format is `base64url(signature).base64url(payload)`,
 * signed HMAC-SHA256 with the app secret.
 *
 * Meta re-tests these callbacks after launch, so a verification that silently
 * accepts an unsigned request is an enforcement risk, not just a bug.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProviderConfig, SignedRequest } from "../types";

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function parseMetaSignedRequest(cfg: ProviderConfig, raw: string): SignedRequest | null {
  const [sigPart, payloadPart] = raw.split(".", 2);
  if (!sigPart || !payloadPart) return null;

  const expected = createHmac("sha256", cfg.clientSecret).update(payloadPart).digest();
  const actual = b64url(sigPart);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64url(payloadPart).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.algorithm !== "HMAC-SHA256") return null;
  const userId = typeof payload.user_id === "string" ? payload.user_id : null;
  if (!userId) return null;

  return { remoteUserId: userId, issuedAt: typeof payload.issued_at === "number" ? payload.issued_at : undefined, payload };
}

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../types";
import { parseMetaSignedRequest } from "./signed-request";

const cfg: ProviderConfig = { clientId: "app", clientSecret: "s3cret" };

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function sign(payload: Record<string, unknown>, secret = cfg.clientSecret) {
  const encoded = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(encoded).digest());
  return `${sig}.${encoded}`;
}

describe("parseMetaSignedRequest", () => {
  it("accepts a correctly signed request", () => {
    const raw = sign({ algorithm: "HMAC-SHA256", user_id: "1234", issued_at: 1700000000 });
    expect(parseMetaSignedRequest(cfg, raw)).toEqual({
      remoteUserId: "1234",
      issuedAt: 1700000000,
      payload: { algorithm: "HMAC-SHA256", user_id: "1234", issued_at: 1700000000 },
    });
  });

  it("rejects a request signed with the wrong secret", () => {
    expect(parseMetaSignedRequest(cfg, sign({ algorithm: "HMAC-SHA256", user_id: "1234" }, "wrong"))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const raw = sign({ algorithm: "HMAC-SHA256", user_id: "1234" });
    const [sig] = raw.split(".");
    const swapped = b64url(Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "9999" }), "utf8"));
    expect(parseMetaSignedRequest(cfg, `${sig}.${swapped}`)).toBeNull();
  });

  it("rejects an unexpected algorithm", () => {
    expect(parseMetaSignedRequest(cfg, sign({ algorithm: "none", user_id: "1234" }))).toBeNull();
  });

  it("rejects a payload with no user id", () => {
    expect(parseMetaSignedRequest(cfg, sign({ algorithm: "HMAC-SHA256" }))).toBeNull();
  });

  it("rejects malformed input", () => {
    for (const raw of ["", "nodot", "a.b", "."]) expect(parseMetaSignedRequest(cfg, raw)).toBeNull();
  });
});

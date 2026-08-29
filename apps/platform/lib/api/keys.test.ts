import { describe, expect, it } from "vitest";
import { API_KEY_PREFIX, bearerFrom, hashApiKey, mintApiKey, rejectedScopes, resolveScopes } from "./keys";

describe("api keys", () => {
  it("mints a prefixed token and stores only its hash", () => {
    const { raw, hash, prefix } = mintApiKey();
    expect(raw.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(raw.length).toBeGreaterThan(40);
    expect(hash).toBe(hashApiKey(raw));
    expect(hash).toHaveLength(64);
    expect(raw).not.toContain(hash);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it("reads only a well-formed bearer header", () => {
    expect(bearerFrom("Bearer rke_abc")).toBe("rke_abc");
    expect(bearerFrom("bearer rke_abc")).toBe("rke_abc");
    expect(bearerFrom("Basic rke_abc")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });

  it("never grants a scope the creator does not hold", () => {
    const creator = { role: "creator" as const, grants: [] };
    expect(resolveScopes(["content.create", "content.edit"], creator)).toEqual(["content.create", "content.edit"]);
    // content.publish is "policy" for a creator: resolved per request, so it is not grantable to a key.
    expect(resolveScopes(["content.publish"], creator)).toEqual([]);
    expect(rejectedScopes(["content.publish", "org.billing"], creator)).toEqual(["content.publish", "org.billing"]);
  });

  it("drops unknown scope strings and duplicates", () => {
    const admin = { role: "admin" as const, grants: [] };
    expect(resolveScopes(["content.create", "content.create", "not.a.capability"], admin)).toEqual(["content.create"]);
  });
});

import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.TOKEN_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("secret envelope", () => {
  it("round-trips and binds to AAD", async () => {
    const { encryptJson, decryptJson, decryptSecret } = await import("./crypto");
    const env = encryptJson({ accessToken: "t0k" }, "conn-1");
    expect(env.ct).not.toContain("t0k");
    expect(decryptJson<{ accessToken: string }>(env, "conn-1").accessToken).toBe("t0k");
    expect(() => decryptSecret(env, "conn-2")).toThrow();
  });
});

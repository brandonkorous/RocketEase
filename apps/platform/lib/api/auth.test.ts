import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/reports/rate-limit";

const state = {
  key: null as Record<string, unknown> | null,
  workspace: { id: "ws1", name: "Acme", timezone: "UTC", archivedAt: null } as Record<string, unknown> | null,
  membership: { role: "admin", grants: [] } as Record<string, unknown> | null,
  updates: [] as unknown[],
};

// `server-only` is a bundler marker; it has no node resolution in tests.
vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {
    query: {
      apiKey: { findFirst: async () => state.key },
      workspace: { findFirst: async () => state.workspace },
      workspaceMembership: { findFirst: async () => state.membership },
    },
    update: () => ({ set: (v: unknown) => ({ where: async () => state.updates.push(v) }) }),
  },
}));

const { authenticateApi, requireScope, idempotencyKey, API_RATE_LIMIT } = await import("./auth");
const { ApiError } = await import("./errors");
const { hashApiKey } = await import("./keys");

const RAW = "rke_test-token";
const liveKey = () => ({ id: "k1", keyHash: hashApiKey(RAW), organizationId: "org1", workspaceId: "ws1", name: "Agent", scopes: ["content.create"], createdByUserId: "u1", revokedAt: null });
const req = (headers: Record<string, string> = {}) => new Request("https://rke.test/api/v1/workspace", { headers });

beforeEach(() => {
  resetRateLimits();
  state.key = liveKey();
  state.workspace = { id: "ws1", name: "Acme", timezone: "UTC", archivedAt: null };
  state.membership = { role: "admin", grants: [] };
  state.updates = [];
});

describe("authenticateApi", () => {
  it("rejects a request with no bearer token", async () => {
    await expect(authenticateApi(req())).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("rejects an unknown or revoked key", async () => {
    state.key = null;
    await expect(authenticateApi(req({ authorization: `Bearer ${RAW}` }))).rejects.toMatchObject({ status: 401 });
  });

  it("resolves the workspace and records lastUsedAt", async () => {
    const ctx = await authenticateApi(req({ authorization: `Bearer ${RAW}` }));
    expect(ctx).toMatchObject({ workspaceId: "ws1", organizationId: "org1", actorUserId: "u1", role: "admin", scopes: ["content.create"] });
    expect(state.updates).toHaveLength(1);
    expect((state.updates[0] as { lastUsedAt: Date }).lastUsedAt).toBeInstanceOf(Date);
  });

  it("refuses a key whose creator lost access", async () => {
    state.membership = null;
    await expect(authenticateApi(req({ authorization: `Bearer ${RAW}` }))).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("rate limits per key with a Retry-After", async () => {
    const r = req({ authorization: `Bearer ${RAW}` });
    for (let i = 0; i < API_RATE_LIMIT; i++) await authenticateApi(r);
    const err = await authenticateApi(r).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(Number(err.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("requireScope", () => {
  const ctx = { keyId: "k1", keyName: "Agent", organizationId: "org1", workspaceId: "ws1", workspaceName: "Acme", timezone: "UTC", actorUserId: "u1", role: "admin" as const, grants: [], scopes: ["content.create" as const] };

  it("allows a scope the key carries and the role holds", () => {
    expect(() => requireScope(ctx, "content.create")).not.toThrow();
  });

  it("denies a capability the key was not scoped for", () => {
    expect(() => requireScope(ctx, "content.publish")).toThrow(/not scoped/);
  });

  it("denies a scoped capability the role has since lost", () => {
    expect(() => requireScope({ ...ctx, role: "viewer", scopes: ["content.create"] }, "content.create")).toThrow(/can no longer/);
  });
});

describe("idempotencyKey", () => {
  const ctx = { keyId: "k1" } as Parameters<typeof idempotencyKey>[0];
  it("namespaces the header per key", () => {
    expect(idempotencyKey(ctx, req({ "idempotency-key": "abc" }))).toBe("api:k1:abc");
    expect(idempotencyKey(ctx, req())).toBeNull();
  });
  it("rejects an absurdly long key", () => {
    expect(() => idempotencyKey(ctx, req({ "idempotency-key": "x".repeat(201) }))).toThrow(/200 characters/);
  });
});

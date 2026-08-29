import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ctx = { keyId: "k1", keyName: "Agent", organizationId: "org1", workspaceId: "ws1", workspaceName: "Acme", timezone: "UTC", actorUserId: "u1", role: "admin", grants: [], scopes: ["content.create"] };
const state = { prior: null as unknown, scopeError: null as Error | null, created: null as unknown };

vi.mock("@/lib/api/auth", async () => {
  const real = await vi.importActual<typeof import("./auth")>("./auth");
  return {
    authenticateApi: async () => ctx,
    requireScope: () => {
      if (state.scopeError) throw state.scopeError;
    },
    idempotencyKey: real.idempotencyKey,
  };
});

class UnknownChannelError extends Error {
  channelIds: string[];
  constructor(ids: string[]) {
    super(`Unknown or unusable channel: ${ids.join(", ")}`);
    this.channelIds = ids;
  }
}

vi.mock("@/lib/authoring", () => ({
  UnknownChannelError,
  itemByIdempotencyKey: async () => state.prior,
  createContentItem: async () => state.created,
}));
vi.mock("@/lib/approvals", () => ({ matchPolicy: async () => ({ name: "Client sign-off" }) }));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => [] }) }) } }));

const { POST } = await import("@/app/api/v1/drafts/route");
const { forbidden } = await import("./errors");

const item = { id: "item1", title: "Post", status: "draft", approvalState: "not_required", sharedText: "hi", sharedAssetIds: [], link: null, scheduledAt: null, createdAt: new Date(0), updatedAt: new Date(0) };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://rke.test/api/v1/drafts", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => {
  state.prior = null;
  state.scopeError = null;
  state.created = { item, variants: [], problems: { ch1: [{ severity: "error", code: "text_required", message: "Instagram needs media.", field: "media" }] } };
});

describe("POST /api/v1/drafts", () => {
  it("creates a draft and reports validation and the approval that will gate it", async () => {
    const res = await post({ text: "hi", channelIds: ["ch1"] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.id).toBe("item1");
    expect(body.item.status).toBe("draft");
    expect(body.approval).toEqual({ required: true, policy: "Client sign-off" });
    expect(body.validation[0]).toMatchObject({ channelId: "ch1", blocking: true });
    expect(body.next).toContain("submit");
  });

  it("rejects a body with no channel in the stable envelope", async () => {
    const res = await post({ text: "hi", channelIds: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "invalid_request", message: "Choose at least one channel." } });
  });

  it("replays an Idempotency-Key instead of creating a second draft", async () => {
    state.prior = item;
    const res = await post({ text: "hi", channelIds: ["ch1"] }, { "idempotency-key": "abc" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotentReplay).toBe(true);
    expect(body.item.id).toBe("item1");
  });

  it("turns an unknown channel into a 400 that points at GET /channels", async () => {
    state.created = Promise.reject(new UnknownChannelError(["nope"]));
    const res = await post({ text: "hi", channelIds: ["nope"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("GET /api/v1/channels");
  });

  it("refuses a key without the content.create scope", async () => {
    state.scopeError = forbidden("This key is not scoped for content.create.");
    const res = await post({ text: "hi", channelIds: ["ch1"] });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaProvider } from "./index";
import { FB_CAPS } from "./graph";
import type { ChannelDescriptor, Credential } from "../types";

const meta = createMetaProvider({ clientId: "app", clientSecret: "shh" });
const cred: Credential = { accessToken: "tok", scopes: [], providerUserId: "me" };
const page: ChannelDescriptor = { remoteId: "page1", kind: "facebook_page", network: "facebook", name: "Acme", capabilities: { ...FB_CAPS(), inbox: { ...FB_CAPS().inbox, messages: false } } };

function stub(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const comment = (id: string, at: string) => ({ id, message: "hi", created_time: at, from: { id: "u1", name: "Ada" } });

afterEach(() => vi.unstubAllGlobals());

describe("Meta inbox poll", () => {
  it("reads every post's comments in one Graph call, skipping posts not updated since the cursor", async () => {
    const f = stub({ data: [
      { id: "p1", updated_time: "2026-01-02T00:00:00Z", comments: { data: [comment("c1", "2026-01-02T00:00:00Z")] } },
      { id: "p2", updated_time: "2025-12-01T00:00:00Z", comments: { data: [comment("c2", "2025-12-01T00:00:00Z")] } },
    ] });
    const res = await meta.fetchInbox!(cred, page, { since: "2026-01-01T00:00:00Z" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.items.map((i) => i.remoteId)).toEqual(["c1"]);
  });

  it("sends the token in the Authorization header, not the URL", async () => {
    const f = stub({ data: [] });
    await meta.fetchInbox!(cred, page, {});
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("access_token");
    expect(url).toContain("appsecret_proof=");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});

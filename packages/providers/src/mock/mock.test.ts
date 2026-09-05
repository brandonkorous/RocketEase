import { beforeEach, describe, expect, it } from "vitest";
import { mockControl, mockProvider } from "./index";
import { ProviderError } from "../types";

async function connect() {
  const code = mockControl.issueCode();
  return mockProvider.exchangeCode(code, "http://localhost/cb");
}

describe("mock provider", () => {
  beforeEach(() => mockControl.reset());

  it("completes the OAuth handshake once per code", async () => {
    const code = mockControl.issueCode();
    const cred = await mockProvider.exchangeCode(code, "http://localhost/cb");
    expect(cred.accessToken).toMatch(/^mock_token_/);
    await expect(mockProvider.exchangeCode(code, "http://localhost/cb")).rejects.toBeInstanceOf(ProviderError);
  });

  it("lists channels with per-channel capabilities", async () => {
    const cred = await connect();
    const channels = await mockProvider.listChannels(cred);
    expect(channels).toHaveLength(3);
    expect(channels[2].capabilities.formats).toEqual([]);
    expect(channels[2].capabilities.reasons?.formats).toBeTruthy();
  });

  it("validates against capabilities before publishing", async () => {
    const cred = await connect();
    const [ch] = await mockProvider.listChannels(cred);
    const issues = mockProvider.validate(ch, { format: "image", text: "x".repeat(3000), media: [] });
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["text_too_long", "image_required"]));
  });

  it("publishes idempotently", async () => {
    const cred = await connect();
    const [ch] = await mockProvider.listChannels(cred);
    const req = { idempotencyKey: "abc123", format: "text" as const, text: "hello", media: [] };
    const a = await mockProvider.publish(cred, ch, req);
    const b = await mockProvider.publish(cred, ch, req);
    expect(a.remoteId).toBe(b.remoteId);
    expect(mockControl.posts()).toHaveLength(1);
  });

  it("surfaces ambiguous failures and lets reconciliation find the post", async () => {
    const cred = await connect();
    const [ch] = await mockProvider.listChannels(cred);
    mockControl.set({ ambiguousPublish: true });
    const req = { idempotencyKey: "amb-1", format: "text" as const, text: "hello", media: [] };
    await expect(mockProvider.publish(cred, ch, req)).rejects.toMatchObject({ ambiguous: true });
    const found = await mockProvider.findPublication(cred, ch, "amb-1");
    expect(found?.remoteId).toBeTruthy();
  });

  it("records the cover frame it was sent, so the chosen frame is provably the published one", async () => {
    const cred = await connect();
    const [ch] = await mockProvider.listChannels(cred);
    const media = [{ url: "https://demo.invalid/clip.mp4", mimeType: "video/mp4", durationSeconds: 12 }];
    await mockProvider.publish(cred, ch, { idempotencyKey: "cover-1", format: "video", text: "clip", media, cover: { offsetMs: 4200 } });
    await mockProvider.publish(cred, ch, { idempotencyKey: "cover-2", format: "video", text: "clip", media });
    const byKey = Object.fromEntries(mockControl.posts().map((p) => [p.idempotencyKey, p.coverOffsetMs]));
    expect(byKey).toEqual({ "cover-1": 4200, "cover-2": null });
  });

  it("maps revoked tokens to permission errors", async () => {
    const cred = await connect();
    await mockProvider.revoke(cred);
    await expect(mockProvider.listChannels(cred)).rejects.toMatchObject({ category: "permission" });
  });
});

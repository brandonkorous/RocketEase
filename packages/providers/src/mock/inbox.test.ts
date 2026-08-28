import { beforeEach, describe, expect, it } from "vitest";
import { mockControl, mockInbox, mockProvider } from "./index";

async function channel() {
  const cred = await mockProvider.exchangeCode(mockControl.issueCode(), "http://localhost/cb");
  const [ch] = await mockProvider.listChannels(cred);
  return { cred, ch };
}

describe("mock inbox", () => {
  beforeEach(() => {
    mockControl.reset();
    mockInbox.reset();
  });

  it("polls seeded items and honours since", async () => {
    const { cred, ch } = await channel();
    const all = await mockProvider.fetchInbox!(cred, ch, {});
    expect(all.items.length).toBeGreaterThan(0);
    const newest = all.items[all.items.length - 1].occurredAt;
    const later = await mockProvider.fetchInbox!(cred, ch, { since: newest });
    expect(later.items).toEqual([]);
    mockInbox.inject(ch.remoteId, { text: "new one" });
    expect((await mockProvider.fetchInbox!(cred, ch, { since: newest })).items.map((i) => i.text)).toEqual(["new one"]);
  });

  it("replies idempotently per idempotency key", async () => {
    const { cred, ch } = await channel();
    const [thread] = mockInbox.threads(ch.remoteId);
    const req = { kind: "comment" as const, threadRemoteId: thread, text: "thanks!", idempotencyKey: "k1" };
    const a = await mockProvider.reply!(cred, ch, req);
    const b = await mockProvider.reply!(cred, ch, req);
    expect(b.remoteId).toBe(a.remoteId);
    const outbound = (await mockProvider.fetchInbox!(cred, ch, {})).items.filter((i) => i.direction === "outbound");
    expect(outbound).toHaveLength(1);
  });

  it("reconciles an ambiguous reply to the same remote id instead of resending", async () => {
    const { cred, ch } = await channel();
    const [thread] = mockInbox.threads(ch.remoteId);
    mockInbox.setAmbiguousReply(true);
    const req = { kind: "comment" as const, threadRemoteId: thread, text: "sorry for the wait", idempotencyKey: "amb" };
    await expect(mockProvider.reply!(cred, ch, req)).rejects.toMatchObject({ ambiguous: true, category: "temporary" });
    const found = await mockProvider.findReply!(cred, ch, "amb");
    expect(found?.remoteId).toBeTruthy();
    mockInbox.setAmbiguousReply(false);
    const again = await mockProvider.reply!(cred, ch, req);
    expect(again.remoteId).toBe(found!.remoteId);
    expect(await mockProvider.findReply!(cred, ch, "never-sent")).toBeNull();
  });

  it("maps policy rejections", async () => {
    const { cred, ch } = await channel();
    const [thread] = mockInbox.threads(ch.remoteId);
    await expect(mockProvider.reply!(cred, ch, { kind: "comment", threadRemoteId: thread, text: "forbidden word", idempotencyKey: "p" })).rejects.toMatchObject({ category: "policy" });
  });

  it("reports health from the token and channel capabilities", async () => {
    const { cred, ch } = await channel();
    expect(await mockProvider.healthCheck!(cred, ch)).toMatchObject({ tokenOk: true, permissionsOk: true, missingScopes: [] });
    const ro = (await mockProvider.listChannels(cred))[2];
    expect(await mockProvider.healthCheck!(cred, ro)).toMatchObject({ tokenOk: true, permissionsOk: false, missingScopes: ["publish"] });
    await mockProvider.revoke(cred);
    expect((await mockProvider.healthCheck!(cred, ch)).tokenOk).toBe(false);
  });
});

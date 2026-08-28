import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMetaProvider } from "./index";

const cfg = { clientId: "app", clientSecret: "shh", extra: { webhookVerifyToken: "verify-me" } };
const meta = createMetaProvider(cfg);
const sign = (raw: string) => ({ "x-hub-signature-256": `sha256=${createHmac("sha256", cfg.clientSecret).update(raw).digest("hex")}` });

/* Shapes follow the Graph API webhook reference (Page feed/mention/messaging, Instagram comments/mentions/messaging). */
const PAGE_BODY = JSON.stringify({
  object: "page",
  entry: [
    {
      id: "page1",
      time: 1700000000,
      changes: [
        { field: "feed", value: { item: "comment", verb: "add", comment_id: "post1_c2", post_id: "page1_post1", parent_id: "post1_c1", from: { id: "u9", name: "Ada" }, message: "Reply here", created_time: 1700000001 } },
        { field: "feed", value: { item: "post", verb: "add", post_id: "page1_post7", from: { id: "u7", name: "Visitor" }, message: "Posting on your page", created_time: 1700000002 } },
        { field: "feed", value: { item: "comment", verb: "remove", comment_id: "post1_c3", post_id: "page1_post1", from: { id: "u9" } } },
        { field: "mention", value: { post_id: "u3_post9", sender_id: "u3", sender_name: "Fan", item: "post", verb: "add" } },
      ],
      messaging: [
        { sender: { id: "psid1" }, recipient: { id: "page1" }, timestamp: 1700000003000, message: { mid: "m.1", text: "Hi there", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] } },
        { sender: { id: "page1" }, recipient: { id: "psid1" }, timestamp: 1700000004000, message: { mid: "m.2", text: "Hello back", is_echo: true } },
        { sender: { id: "psid1" }, recipient: { id: "page1" }, timestamp: 1700000005000, read: { watermark: 1700000004000 } },
      ],
    },
  ],
});

const IG_BODY = JSON.stringify({
  object: "instagram",
  entry: [
    {
      id: "ig1",
      time: 1700000100,
      changes: [
        { field: "comments", value: { id: "c100", text: "Nice!", from: { id: "u5", username: "ada" }, media: { id: "media9", media_product_type: "FEED" } } },
        { field: "comments", value: { id: "c101", text: "Thanks", from: { id: "ig1", username: "brand" }, media: { id: "media9" }, parent_id: "c100" } },
        { field: "mentions", value: { media_id: "media42", comment_id: "c200" } },
      ],
      messaging: [{ sender: { id: "igsid1" }, recipient: { id: "ig1" }, timestamp: 1700000101000, message: { mid: "igm.1", text: "DM" } }],
    },
  ],
});

describe("Meta webhook verification", () => {
  it("answers the subscription handshake only with the configured verify token", () => {
    expect(meta.verifyWebhook!({ headers: {}, rawBody: "", query: { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" } })).toBe(true);
    expect(meta.verifyWebhook!({ headers: {}, rawBody: "", query: { "hub.mode": "subscribe", "hub.verify_token": "nope" } })).toBe(false);
  });
  it("accepts a valid X-Hub-Signature-256 and rejects tampering or missing signatures", () => {
    expect(meta.verifyWebhook!({ headers: sign(PAGE_BODY), rawBody: PAGE_BODY })).toBe(true);
    expect(meta.verifyWebhook!({ headers: sign(PAGE_BODY), rawBody: PAGE_BODY + " " })).toBe(false);
    expect(meta.verifyWebhook!({ headers: {}, rawBody: PAGE_BODY })).toBe(false);
  });
});

describe("Meta webhook parsing and inbox mapping", () => {
  const pageEvents = meta.parseWebhook!(PAGE_BODY);
  const items = (kind: string) => pageEvents.filter((e) => e.kind === kind).flatMap((e) => meta.inboxItemsFromWebhook!(e) ?? []);

  it("emits one event per change/messaging entry with stable ids", () => {
    expect(pageEvents).toHaveLength(7);
    expect(pageEvents.map((e) => e.kind)).toEqual(["page.feed", "page.feed", "page.feed", "page.mention", "page.messaging", "page.messaging", "page.messaging"]);
    expect(pageEvents[4].eventId).toBe("page1:msg:m.1");
    expect(new Set(pageEvents.map((e) => e.eventId)).size).toBe(7);
  });

  it("maps feed comments to their root comment thread and visitor posts to mentions; ignores removals", () => {
    const feed = items("page.feed");
    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({ remoteId: "post1_c2", threadRemoteId: "post1_c1", kind: "comment", direction: "inbound", inReplyToRemoteId: "post1_c1", postRemoteId: "page1_post1", text: "Reply here", occurredAt: "2023-11-14T22:13:21.000Z" });
    expect(feed[1]).toMatchObject({ remoteId: "page1_post7", kind: "mention", author: { remoteId: "u7", name: "Visitor" } });
  });

  it("maps page mentions", () => {
    expect(items("page.mention")[0]).toMatchObject({ kind: "mention", threadRemoteId: "u3_post9", author: { remoteId: "u3", name: "Fan" } });
  });

  it("maps Messenger messages keyed by the customer PSID, marks echoes outbound, drops read receipts", () => {
    const msgs = items("page.messaging");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ remoteId: "m.1", threadRemoteId: "psid1", direction: "inbound", text: "Hi there", occurredAt: "2023-11-14T22:13:23.000Z" });
    expect(msgs[0].attachments).toEqual([{ url: "https://cdn/x.jpg", mimeType: "image/*" }]);
    expect(msgs[1]).toMatchObject({ remoteId: "m.2", threadRemoteId: "psid1", direction: "outbound" });
  });

  it("maps Instagram comments, replies, mentions and DMs", () => {
    const ev = meta.parseWebhook!(IG_BODY);
    const all = ev.flatMap((e) => meta.inboxItemsFromWebhook!(e) ?? []);
    expect(all.map((i) => i.kind)).toEqual(["comment", "comment", "mention", "message"]);
    expect(all[0]).toMatchObject({ remoteId: "c100", threadRemoteId: "c100", postRemoteId: "media9", author: { handle: "@ada" } });
    expect(all[1]).toMatchObject({ remoteId: "c101", threadRemoteId: "c100", direction: "outbound", inReplyToRemoteId: "c100" });
    expect(all[2]).toMatchObject({ remoteId: "mention:c200", threadRemoteId: "c200", postRemoteId: "media42" });
    expect(all[3]).toMatchObject({ remoteId: "igm.1", threadRemoteId: "igsid1", kind: "message" });
  });

  it("returns null for non-inbox events", () => {
    expect(meta.inboxItemsFromWebhook!({ eventId: "x", kind: "page.ratings", occurredAt: "2024-01-01T00:00:00Z", payload: {} })).toBeNull();
  });
});

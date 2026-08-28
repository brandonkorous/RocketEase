import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTikTokProvider } from "./index";
import { createLinkedInProvider } from "../linkedin";
import { parseTikTokWebhook, verifyTikTokWebhook } from "./webhooks";

const cfg = { clientId: "key", clientSecret: "secret" };
const tiktok = createTikTokProvider(cfg);

/* Shape from the TikTok for Developers webhooks reference; `content` is a JSON string. */
const BODY = JSON.stringify({ client_key: "key", event: "post.publish.complete", create_time: 1700000000, user_openid: "open-1", content: JSON.stringify({ publish_id: "v_pub.1", publish_type: "DIRECT_PUBLISH" }) });
const T = 1700000000;
const sig = (raw: string, t = T, secret = cfg.clientSecret) => ({ "tiktok-signature": `t=${t},s=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}` });

describe("TikTok webhook verification", () => {
  it("accepts a valid TikTok-Signature within the replay window", () => {
    expect(verifyTikTokWebhook(cfg, sig(BODY), BODY, T + 10)).toBe(true);
  });
  it("rejects wrong secrets, tampered bodies, stale timestamps and missing headers", () => {
    expect(verifyTikTokWebhook(cfg, sig(BODY, T, "other"), BODY, T)).toBe(false);
    expect(verifyTikTokWebhook(cfg, sig(BODY), BODY + "x", T)).toBe(false);
    expect(verifyTikTokWebhook(cfg, sig(BODY), BODY, T + 3600)).toBe(false);
    expect(verifyTikTokWebhook(cfg, {}, BODY, T)).toBe(false);
  });
});

describe("TikTok webhook parsing", () => {
  it("decodes the nested content and keys the event by open id + publish id", () => {
    const [e] = parseTikTokWebhook(BODY);
    expect(e).toMatchObject({ eventId: "open-1:post.publish.complete:v_pub.1", channelRemoteId: "open-1", kind: "tiktok.post.publish.complete", occurredAt: "2023-11-14T22:13:20.000Z", payload: { publish_id: "v_pub.1" } });
    expect(parseTikTokWebhook("{}")).toEqual([]);
  });
  it("never yields inbox items (TikTok has no comment/DM webhooks)", () => {
    const [e] = tiktok.parseWebhook!(BODY);
    expect(tiktok.inboxItemsFromWebhook!(e)).toBeNull();
  });
});

describe("LinkedIn has no webhooks", () => {
  it("is polling-only and says so", () => {
    const li = createLinkedInProvider(cfg);
    expect(li.verifyWebhook).toBeUndefined();
    expect(li.parseWebhook).toBeUndefined();
  });
});

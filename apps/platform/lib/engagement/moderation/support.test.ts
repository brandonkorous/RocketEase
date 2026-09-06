import { describe, expect, it } from "vitest";
import { HIDE_SUPPORT, type Capabilities } from "@rocketease/providers";
import { hideDecision, type HideChannel } from "./support";

const caps = (inbox: Partial<Capabilities["inbox"]>, reasons: Capabilities["reasons"] = {}): Capabilities => ({
  formats: ["text"],
  scheduling: "internal",
  limits: { imagesMax: 1, mentions: true, firstComment: false, links: "inline", altText: true },
  inbox: { comments: true, mentions: true, messages: true, reviews: false, reply: true, ...inbox },
  insights: { organic: false, audience: false },
  ads: { import: false, manage: false },
  ingestion: { webhooks: false, polling: true },
  reasons,
  checkedAt: "2026-09-05T00:00:00Z",
});
const channel = (over: Partial<HideChannel> = {}): HideChannel => ({ network: "instagram", provider: "meta", status: "healthy", name: "Northwind", capabilities: caps({ hide: true }), ...over });
const yes = () => true;

describe("hideDecision", () => {
  it("allows a comment on a network that can hide, from a connected channel with an adapter", () => {
    expect(hideDecision(channel(), "comment", yes)).toEqual({ ok: true });
  });

  it("refuses anything that is not a comment, with a reason per kind", () => {
    expect(hideDecision(channel(), "message", yes)).toMatchObject({ ok: false, why: expect.stringMatching(/direct message/) });
    expect(hideDecision(channel(), "review", yes)).toMatchObject({ ok: false, why: expect.stringMatching(/review/) });
    expect(hideDecision(channel(), "mention", yes)).toMatchObject({ ok: false, why: expect.stringMatching(/mention/) });
  });

  it("repeats the provider table's reason for a network with no hide API", () => {
    const li = hideDecision(channel({ network: "linkedin", provider: "linkedin", capabilities: caps({ hide: false }) }), "comment", yes);
    expect(li).toEqual({ ok: false, why: (HIDE_SUPPORT.linkedin as { why: string }).why });
  });

  it("uses the channel's own reason when the account did not grant the permission", () => {
    const x = channel({ network: "x", provider: "x", capabilities: caps({ hide: false }, { hide: "Hiding a reply needs the tweet.moderate.write scope; reconnect the account to grant it." }) });
    expect(hideDecision(x, "comment", yes)).toMatchObject({ ok: false, why: expect.stringMatching(/tweet\.moderate\.write/) });
  });

  it("treats capabilities stored before the flag existed as allowed when the adapter can hide", () => {
    expect(hideDecision(channel({ capabilities: caps({ hide: undefined }) }), "comment", yes)).toEqual({ ok: true });
  });

  it("refuses when the adapter is not enabled here or the channel is disconnected", () => {
    expect(hideDecision(channel(), "comment", () => false)).toMatchObject({ ok: false, why: expect.stringMatching(/not enabled/) });
    expect(hideDecision(channel({ status: "disconnected" }), "comment", yes)).toMatchObject({ ok: false, why: expect.stringMatching(/disconnected/) });
  });
});

import { describe, expect, it } from "vitest";
import { AUTOMATED_DM_PER_DAY, sendDecision, type SendInput } from "./window";

const now = new Date("2026-09-06T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const input = (over: Partial<SendInput> = {}): SendInput => ({ network: "instagram", networkLabel: "Instagram", kind: "message", now, lastInboundAt: hoursAgo(2), automated: false, recent: { per15min: 0, per24h: 0 }, automatedToContact: 0, ...over });

describe("sendDecision", () => {
  it("opens a 24 h window from the customer's last message on Meta, and says when it closes", () => {
    expect(sendDecision(input())).toEqual({ ok: true, closesAt: hoursAgo(-22), rule: "Instagram allows a reply within 24 h of the customer's last message." });
  });

  it("closes the window after 24 h and tells a person about the 7-day Human Agent path", () => {
    const d = sendDecision(input({ lastInboundAt: hoursAgo(30) }));
    expect(d).toMatchObject({ ok: false, retryAt: null, why: expect.stringMatching(/within 24 h .* theirs was 30 h ago\. Wait for them to write again\. Instagram lets a person answer up to 7 days later/) });
    // A rule gets no such offer: the Human Agent tag is for people.
    expect((sendDecision(input({ lastInboundAt: hoursAgo(30), automated: true })) as { why: string }).why).not.toMatch(/7 days/);
  });

  it("refuses a thread the customer never wrote in, on a network with a window", () => {
    expect(sendDecision(input({ lastInboundAt: null }))).toMatchObject({ ok: false, why: expect.stringMatching(/none has arrived/), retryAt: null });
  });

  it("has no window on X but waits on X's published send caps", () => {
    expect(sendDecision(input({ network: "x", networkLabel: "X", lastInboundAt: hoursAgo(300) }))).toEqual({ ok: true, closesAt: null, rule: null });
    const capped = sendDecision(input({ network: "x", networkLabel: "X", recent: { per15min: 15, per24h: 40 } }));
    expect(capped).toMatchObject({ ok: false, why: expect.stringMatching(/15 direct messages per 15 minutes/), retryAt: new Date(now.getTime() + 15 * 60_000) });
    const daily = sendDecision(input({ network: "x", networkLabel: "X", recent: { per15min: 3, per24h: 1440 } }));
    expect(daily).toMatchObject({ ok: false, why: expect.stringMatching(/1,440 direct messages per 24 hours/), retryAt: new Date(now.getTime() + 3_600_000) });
  });

  it("lets a rule send one automated DM per contact per day, then leaves it to a person", () => {
    expect(sendDecision(input({ automated: true })).ok).toBe(true);
    expect(sendDecision(input({ automated: true, automatedToContact: AUTOMATED_DM_PER_DAY }))).toMatchObject({ ok: false, why: expect.stringMatching(/at most 1 automated direct message per contact per 24 h/), retryAt: null });
    // The same count never stops a person.
    expect(sendDecision(input({ automated: false, automatedToContact: 5 })).ok).toBe(true);
  });

  it("judges only direct messages; a public reply has no window, and a network without DMs says why", () => {
    expect(sendDecision(input({ kind: "comment", lastInboundAt: hoursAgo(500) }))).toEqual({ ok: true, closesAt: null, rule: null });
    expect(sendDecision(input({ network: "threads", networkLabel: "Threads" }))).toMatchObject({ ok: false, why: expect.stringMatching(/Threads has no direct-message API/) });
  });
});

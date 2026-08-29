import { describe, expect, it, vi } from "vitest";
import type { Capabilities } from "@make-it-social/providers/client";
import { EMPTY_BRAND_VOICE } from "../brand-voice";
import type { DraftChannel } from "../drafts";
import { conceptsForChannel } from "./concepts";
import { runGenerator } from "./run";
import { conceptText, type Brief } from "./types";

const caps = (over: Partial<Capabilities["limits"]> = {}, ads = { import: false, manage: false }): Capabilities => ({
  formats: ["text", "image"],
  scheduling: "internal",
  limits: { textMaxChars: 280, hashtagsMax: 3, firstComment: true, altText: true, links: "inline", ...over },
  inbox: { comments: true, mentions: true, messages: false, reviews: false, reply: true },
  insights: { organic: true, audience: false },
  ads,
  ingestion: { webhooks: false, polling: true },
  disclosure: "caption",
  checkedAt: new Date().toISOString(),
});

const channel = (over: Partial<DraftChannel> = {}): DraftChannel => ({
  channelId: "ch1",
  network: "linkedin",
  networkLabel: "LinkedIn",
  channelName: "BrightFit",
  textMax: 280,
  hashtagsMax: 3,
  capabilities: caps(),
  ...over,
});

const brief: Brief = { goal: "engagement", topic: "Strength programme", keyPoints: ["Six weeks"], channels: ["ch1"], count: 2, includeAds: false };

const reply = (body: unknown) => ({ text: JSON.stringify(body) });
const concept = (hook: string, body = "Body text.", extra: Record<string, unknown> = {}) => ({ format: "text", hook, body, cta: "Reply below.", hashtags: ["Strength"], rationale: "Direct question.", ...extra });

describe("conceptsForChannel", () => {
  it("returns validated concepts and suggests the AI-assisted disclosure", async () => {
    const gen = vi.fn().mockResolvedValue(reply({ concepts: [concept("Six weeks."), concept("Three sessions.")] }));
    const r = await conceptsForChannel(channel(), { brief, voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.concepts).toHaveLength(2);
    expect(r.concepts[0].validation).toEqual([]);
    expect(r.concepts[0].disclosure.flag).toBe("assisted");
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("honours the channel's formats rather than the model's suggestion", async () => {
    const gen = vi.fn().mockResolvedValue(reply({ concepts: [concept("Hi", "Body", { format: "story" })] }));
    const r = await conceptsForChannel(channel(), { brief, voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.concepts[0].format).toBe("text");
  });

  it("drops a first comment the channel cannot post", async () => {
    const ch = channel({ capabilities: caps({ firstComment: false }) });
    const gen = vi.fn().mockResolvedValue(reply({ concepts: [concept("Hi", "Body", { firstComment: "Extra hashtags" })] }));
    const r = await conceptsForChannel(ch, { brief, voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.concepts[0].firstComment).toBeUndefined();
    expect(r.concepts[0].validation).toEqual([]);
  });

  it("retries once when the first answer is not JSON", async () => {
    const gen = vi.fn().mockResolvedValueOnce({ text: "Sorry, here are some ideas:" }).mockResolvedValueOnce(reply({ concepts: [concept("Hi")] }));
    const r = await conceptsForChannel(channel(), { brief, voice: EMPTY_BRAND_VOICE }, gen);
    expect(gen).toHaveBeenCalledTimes(2);
    expect(r.concepts).toHaveLength(1);
  });

  it("gives up honestly after the retry rather than inventing a concept", async () => {
    const gen = vi.fn().mockResolvedValue({ text: "no json here" });
    const r = await conceptsForChannel(channel(), { brief, voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.concepts).toEqual([]);
    expect(r.error).toContain("JSON");
  });

  it("asks the model to shorten over-limit copy instead of truncating it", async () => {
    const long = "x".repeat(400);
    const gen = vi
      .fn()
      .mockResolvedValueOnce(reply({ concepts: [concept("Hook", long)] }))
      .mockResolvedValueOnce(reply({ hook: "Hook", body: "Short body.", cta: "Reply below.", hashtags: ["Strength"] }));
    const r = await conceptsForChannel(channel(), { brief: { ...brief, count: 1 }, voice: EMPTY_BRAND_VOICE }, gen);
    expect(gen).toHaveBeenCalledTimes(2);
    expect(conceptText(r.concepts[0]).length).toBeLessThanOrEqual(280);
    expect(r.concepts[0].body).toBe("Short body.");
    expect(r.concepts[0].validation).toEqual([]);
  });

  it("keeps the original when the shortening pass comes back longer", async () => {
    const long = "x".repeat(400);
    const gen = vi
      .fn()
      .mockResolvedValueOnce(reply({ concepts: [concept("Hook", long)] }))
      .mockResolvedValueOnce(reply({ hook: "Hook", body: "y".repeat(600), cta: "Reply below.", hashtags: [] }));
    const r = await conceptsForChannel(channel(), { brief: { ...brief, count: 1 }, voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.concepts[0].body).toBe(long);
    expect(r.concepts[0].validation.some((i) => i.code === "text_too_long")).toBe(true);
  });

  it("caps hashtags at the channel's own limit", async () => {
    const gen = vi.fn().mockResolvedValue(reply({ concepts: [concept("Hi", "Body", { hashtags: ["a", "b", "c", "d", "e"] })] }));
    const r = await conceptsForChannel(channel(), { brief: { ...brief, count: 1 }, voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.concepts[0].hashtags).toHaveLength(3);
  });
});

describe("runGenerator", () => {
  it("keeps one channel's concepts when another fails, and says which failed", async () => {
    const ok = channel();
    const bad = channel({ channelId: "ch2", network: "instagram", networkLabel: "Instagram" });
    const gen = vi.fn(async (p: { user: string }) => (p.user.includes("Instagram") ? { text: "nope" } : reply({ concepts: [concept("Hi")] })));
    const r = await runGenerator({ brief: { ...brief, count: 1, channels: ["ch1", "ch2"] }, channels: [ok, bad], voice: EMPTY_BRAND_VOICE }, gen as never);
    expect(r.concepts).toHaveLength(1);
    expect(r.error).toBeUndefined();
    expect(r.notes.join(" ")).toContain("Instagram");
  });

  it("writes ad copy only for channels with both ad fields and ads access", async () => {
    const withAds = channel({ capabilities: caps({}, { import: true, manage: true }) });
    const noAds = channel({ channelId: "ch2", network: "x", networkLabel: "X (Twitter)", capabilities: caps({}, { import: true, manage: true }) });
    const gen = vi.fn(async (p: { user: string }) =>
      p.user.includes("ad copy variants") ? reply({ variants: [{ primaryText: "Six weeks.", headline: "Start now", description: "", cta: "sign_up" }] }) : reply({ concepts: [concept("Hi")] }),
    );
    const r = await runGenerator({ brief: { ...brief, count: 1, includeAds: true, channels: ["ch1", "ch2"] }, channels: [withAds, noAds], voice: EMPTY_BRAND_VOICE }, gen as never);
    expect(r.adSets.map((a) => a.channelId)).toEqual(["ch1"]);
    expect(r.adSets[0].variants[0].cta).toBe("sign_up");
  });

  it("skips ad copy entirely when the brief didn't ask for it", async () => {
    const withAds = channel({ capabilities: caps({}, { import: true, manage: true }) });
    const gen = vi.fn().mockResolvedValue(reply({ concepts: [concept("Hi")] }));
    const r = await runGenerator({ brief: { ...brief, count: 1 }, channels: [withAds], voice: EMPTY_BRAND_VOICE }, gen);
    expect(r.adSets).toEqual([]);
  });
});

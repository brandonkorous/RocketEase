import { describe, expect, test, vi } from "vitest";
import type { Capabilities } from "@make-it-social/providers";
import { AI_UNCONFIGURED } from "./messages";
import { EMPTY_BRAND_VOICE } from "./brand-voice";
import { captionDrafts, repurposeDrafts, replyDrafts, type DraftChannel, type Generator } from "./drafts";

const caps = (limits: Capabilities["limits"]): Capabilities => ({
  formats: ["image", "carousel"],
  scheduling: "internal",
  limits,
  inbox: { comments: true, mentions: true, messages: true, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: false, manage: false },
  ingestion: { webhooks: true, polling: true },
  checkedAt: "2026-08-28T00:00:00.000Z",
});

const channel = (id: string, name: string, limits: Capabilities["limits"] = { textMaxChars: 2200 }): DraftChannel => ({
  channelId: id,
  network: "instagram",
  networkLabel: "Instagram",
  channelName: name,
  textMax: limits.textMaxChars,
  hashtagsMax: limits.hashtagsMax,
  capabilities: caps(limits),
});

const gen = (text: string): Generator => vi.fn(async () => ({ text }));
const failing = (error: string): Generator => vi.fn(async () => ({ error }));

describe("captionDrafts", () => {
  test("returns one labelled variant per draft, per channel", async () => {
    const g = gen("first\n---\nsecond");
    const out = await captionDrafts({ channels: [channel("c1", "Studio"), channel("c2", "Shop")], text: "hello", voice: EMPTY_BRAND_VOICE }, g);
    expect(g).toHaveBeenCalledTimes(2);
    expect(out.variants?.map((v) => v.text)).toEqual(["first", "second", "first", "second"]);
    expect(out.variants?.[0].label).toBe("Instagram · Studio (1)");
    expect(out.variants?.[2].channelId).toBe("c2");
    expect(out.error).toBeUndefined();
  });

  test("flags a draft that breaks the channel's own limits instead of truncating it", async () => {
    const long = "x".repeat(40);
    const out = await captionDrafts({ channels: [channel("c1", "Studio", { textMaxChars: 20 })], text: "hi", voice: EMPTY_BRAND_VOICE }, gen(long));
    expect(out.variants?.[0].text).toBe(long);
    expect(out.variants?.[0].note).toMatch(/20 characters over the 20 limit/);
  });

  test("too many hashtags is a note, never a silent edit", async () => {
    const out = await captionDrafts({ channels: [channel("c1", "Studio", { hashtagsMax: 1 })], text: "hi", voice: EMPTY_BRAND_VOICE }, gen("#a #b"));
    expect(out.variants?.[0].note).toMatch(/at most 1 hashtags/i);
  });

  test("a clean draft carries no note", async () => {
    const out = await captionDrafts({ channels: [channel("c1", "Studio")], text: "hi", voice: EMPTY_BRAND_VOICE }, gen("short and fine"));
    expect(out.variants?.[0].note).toBeUndefined();
  });

  test("with AI unconfigured every action surfaces the configuration message", async () => {
    const g = failing(AI_UNCONFIGURED);
    const out = await captionDrafts({ channels: [channel("c1", "Studio")], text: "hi", voice: EMPTY_BRAND_VOICE }, g);
    expect(out).toEqual({ variants: [], error: AI_UNCONFIGURED });
  });

  test("one failing channel doesn't lose the drafts that worked", async () => {
    let call = 0;
    const g: Generator = vi.fn(async () => (call++ === 0 ? { error: "boom" } : { text: "ok" }));
    const out = await captionDrafts({ channels: [channel("c1", "A"), channel("c2", "B")], text: "hi", voice: EMPTY_BRAND_VOICE }, g);
    expect(out.error).toBeUndefined();
    expect(out.variants).toHaveLength(1);
  });

  test("an empty model response is an error, not an empty list", async () => {
    const out = await captionDrafts({ channels: [channel("c1", "A")], text: "hi", voice: EMPTY_BRAND_VOICE }, gen("   "));
    expect(out.error).toMatch(/didn't return anything usable/);
  });
});

describe("repurposeDrafts", () => {
  test("drafts one short post per target channel", async () => {
    const out = await repurposeDrafts({ channels: [channel("c1", "Studio")], sourceText: "a long article", voice: EMPTY_BRAND_VOICE }, gen("short post"));
    expect(out.variants?.[0]).toMatchObject({ channelId: "c1", text: "short post" });
  });
});

describe("replyDrafts", () => {
  const input = { voice: EMPTY_BRAND_VOICE, networkLabel: "Instagram", contactName: "Ada", turns: [{ who: "customer" as const, text: "When do you open?" }], savedReplies: [], textMax: 20 };

  test("numbers the suggestions and flags an over-length one", async () => {
    const out = await replyDrafts(input, gen("we open at seven\n---\n" + "y".repeat(30)));
    expect(out.variants?.[0].label).toBe("Suggestion 1");
    expect(out.variants?.[0].note).toBeUndefined();
    expect(out.variants?.[1].note).toMatch(/10 characters over the 20 limit/);
  });

  test("passes the generator's error straight through", async () => {
    expect(await replyDrafts(input, failing(AI_UNCONFIGURED))).toEqual({ variants: [], error: AI_UNCONFIGURED });
  });
});

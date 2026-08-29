import { describe, expect, it } from "vitest";
import type { Capabilities } from "@rocketease/providers";
import { checkRow, csvTemplate, MAX_IMPORT_ROWS, parsePostsCsv, resolveChannels, rowBlocked, splitCsv, type ImportChannel } from "./csv";

const caps = (over: Partial<Capabilities["limits"]> = {}): Capabilities =>
  ({ formats: ["text", "image"], scheduling: { supported: true }, limits: { textMaxChars: 100, firstComment: true, links: "inline", ...over }, inbox: {}, insights: {}, ads: {}, ingestion: {} }) as unknown as Capabilities;

const channels: ImportChannel[] = [
  { id: "c1", name: "Studio IG", handle: "studio", network: "instagram", capabilities: caps({ hashtagsMax: 2 }) },
  { id: "c2", name: "Studio LI", handle: null, network: "linkedin", capabilities: caps({ firstComment: false, links: "none" }) },
];
const NOW = new Date("2026-08-28T00:00:00Z");

describe("splitCsv", () => {
  it("handles quotes, embedded commas, newlines and doubled quotes", () => {
    expect(splitCsv('a,b\n"one, two","he said ""hi""\nsecond line"')).toEqual([["a", "b"], ["one, two", 'he said "hi"\nsecond line']]);
  });
  it("strips a BOM, normalizes CRLF and drops blank rows", () => {
    expect(splitCsv("﻿a,b\r\n1,2\r\n\r\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
});

describe("parsePostsCsv", () => {
  it("refuses a file without the required columns", () => {
    expect(parsePostsCsv("text,link\nhi,x").headerError).toMatch(/channels/);
    expect(parsePostsCsv("").headerError).toBe("The file is empty.");
  });
  it("maps columns by name, in any order, ignoring case and spaces", () => {
    const r = parsePostsCsv("Channels,TEXT,Scheduled At\nstudio,Hello,2026-09-01T09:00:00Z");
    expect(r.headerError).toBeNull();
    expect(r.rows[0]).toMatchObject({ line: 2, text: "Hello", channels: ["studio"], scheduledAt: "2026-09-01T09:00:00Z" });
  });
  it("splits channels and media_urls on commas, semicolons and spaces", () => {
    const r = parsePostsCsv('text,channels,media_urls\nhi,"studio; c2 instagram","https://a/1.jpg https://a/2.jpg"');
    expect(r.rows[0].channels).toEqual(["studio", "c2", "instagram"]);
    expect(r.rows[0].mediaUrls).toHaveLength(2);
  });
  it("caps at 500 rows and reports what it ignored", () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => `post ${i},studio`).join("\n");
    const r = parsePostsCsv(`text,channels\n${body}`);
    expect(r.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(r.ignored).toBe(3);
  });
  it("round-trips its own template", () => {
    const r = parsePostsCsv(csvTemplate());
    expect(r.headerError).toBeNull();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].channels).toEqual(["@ourhandle", "instagram"]);
  });
});

describe("resolveChannels", () => {
  it("matches ids, handles with or without @, names and network keys", () => {
    expect(resolveChannels(["c1"], channels).ids).toEqual(["c1"]);
    expect(resolveChannels(["@studio"], channels).ids).toEqual(["c1"]);
    expect(resolveChannels(["studio ig"], channels).ids).toEqual(["c1"]);
    expect(resolveChannels(["linkedin"], channels).ids).toEqual(["c2"]);
  });
  it("dedupes and reports what it could not match", () => {
    const r = resolveChannels(["c1", "@studio", "nope"], channels);
    expect(r.ids).toEqual(["c1"]);
    expect(r.unknown).toEqual(["nope"]);
  });
});

describe("checkRow", () => {
  const row = (over: Partial<Parameters<typeof checkRow>[0]> = {}) => ({ line: 2, text: "Hello", channels: ["c1"], scheduledAt: null, firstComment: null, link: null, mediaUrls: [], ...over });

  it("passes a clean row", () => {
    const r = checkRow(row(), channels, NOW);
    expect(rowBlocked(r)).toBe(false);
    expect(r.channelNames).toEqual(["Studio IG"]);
  });
  it("blocks a row with no text and no media", () => {
    expect(rowBlocked(checkRow(row({ text: "" }), channels, NOW))).toBe(true);
  });
  it("blocks an unknown channel by name", () => {
    const r = checkRow(row({ channels: ["ghost"] }), channels, NOW);
    expect(r.problems.some((p) => p.code === "channel_unknown")).toBe(true);
    expect(rowBlocked(r)).toBe(true);
  });
  it("runs the composer validator per channel and names the channel", () => {
    const r = checkRow(row({ text: "x".repeat(200), channels: ["c1", "c2"] }), channels, NOW);
    const long = r.problems.filter((p) => p.code === "text_too_long");
    expect(long.map((p) => p.channelName).sort()).toEqual(["Studio IG", "Studio LI"]);
  });
  it("surfaces per-channel capability gaps, not a blanket error", () => {
    const r = checkRow(row({ firstComment: "more", channels: ["c1", "c2"] }), channels, NOW);
    const fc = r.problems.filter((p) => p.code === "first_comment_unsupported");
    expect(fc).toHaveLength(1);
    expect(fc[0].channelName).toBe("Studio LI");
  });
  it("counts hashtags against the channel's own ceiling", () => {
    const r = checkRow(row({ text: "#a #b #c" }), channels, NOW);
    expect(r.problems.some((p) => p.code === "too_many_hashtags")).toBe(true);
  });
  it("rejects an unparsable time and warns on a past one", () => {
    expect(checkRow(row({ scheduledAt: "next tuesday" }), channels, NOW).problems.some((p) => p.code === "schedule_unparsable")).toBe(true);
    const past = checkRow(row({ scheduledAt: "2026-01-01T09:00:00Z" }), channels, NOW);
    expect(past.problems.find((p) => p.code === "schedule_in_past")?.severity).toBe("warning");
    expect(rowBlocked(past)).toBe(false);
  });
  it("never fetches media: URLs are a warning and a note", () => {
    const r = checkRow(row({ mediaUrls: ["https://a/1.jpg"] }), channels, NOW);
    expect(r.problems.find((p) => p.code === "media_not_fetched")?.severity).toBe("warning");
    expect(r.mediaUrls).toEqual(["https://a/1.jpg"]);
    expect(rowBlocked(r)).toBe(false);
  });
});

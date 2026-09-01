import { describe, expect, it } from "vitest";
import type { CaptionWord } from "@/db/schema/voice";
import { specFor } from "@/lib/media/canvas/specs";
import { assColour, assTime, escapeAss, styleForPlacement, toAss } from "./ass";
import { buildCues, charsPerSecond, cueText, tooFastToRead, wrap, type Cue } from "./cues";
import { parseCues, srtTime, toSrt, toVtt, vttTime } from "./formats";

/** Words at a steady 400ms each, so timing expectations stay readable. */
const say = (text: string, startMs = 0, stepMs = 400, speaker?: string): CaptionWord[] =>
  text.split(" ").map((t, i) => ({ text: t, startMs: startMs + i * stepMs, endMs: startMs + (i + 1) * stepMs, speaker }));

describe("wrap", () => {
  it("fills a line before starting the next", () => {
    expect(wrap(["aaa", "bbb", "ccc"], 7, 2)).toEqual(["aaa bbb", "ccc"]);
  });

  it("gives up rather than silently producing a third line", () => {
    expect(wrap(["aaaa", "bbbb", "cccc"], 4, 2)).toBeNull();
  });

  it("keeps a single over-long word rather than dropping it", () => {
    expect(wrap(["supercalifragilistic"], 5, 1)).toEqual(["supercalifragilistic"]);
  });
});

describe("buildCues", () => {
  it("groups words into readable blocks rather than one wall of text", () => {
    const cues = buildCues(say("the quick brown fox jumps over the lazy dog again and again"));
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) expect(c.lines.length).toBeLessThanOrEqual(2);
  });

  it("never lets a cue run past the maximum duration", () => {
    const cues = buildCues(say("a b c d e f g h i j k l"));
    for (const c of cues) expect(c.endMs - c.startMs).toBeLessThanOrEqual(3000);
  });

  it("holds a very short cue to the minimum so it does not flash", () => {
    const cues = buildCues([{ text: "Hi.", startMs: 0, endMs: 120 }]);
    expect(cues[0].endMs - cues[0].startMs).toBe(800);
  });

  it("ALWAYS breaks on a speaker change — two people never share a block", () => {
    const words = [...say("hello there", 0, 300, "A"), ...say("hi back", 600, 300, "B")];
    const cues = buildCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0].speaker).toBe("A");
    expect(cues[1].speaker).toBe("B");
  });

  it("breaks across a silence, because that is where a sentence ended", () => {
    const words = [...say("one two", 0, 300), ...say("three four", 2000, 300)];
    expect(buildCues(words)).toHaveLength(2);
  });

  it("breaks after a full stop once the block is long enough to read", () => {
    const cues = buildCues(say("this is done. now the next part begins", 0, 400));
    expect(cueText(cues[0])).toBe("this is done.");
  });

  it("does not break on a full stop that arrives too soon to be readable", () => {
    const cues = buildCues(say("no. keep going here", 0, 200));
    expect(cueText(cues[0]).startsWith("no. keep")).toBe(true);
  });

  it("produces cues that never overlap, even after the minimum-duration floor", () => {
    const words: CaptionWord[] = [
      { text: "quick.", startMs: 0, endMs: 100 },
      { text: "next", startMs: 300, endMs: 700 },
    ];
    const cues = buildCues(words);
    for (let i = 0; i < cues.length - 1; i++) expect(cues[i].endMs).toBeLessThanOrEqual(cues[i + 1].startMs);
  });

  it("drops blank and time-reversed words rather than emitting a broken cue", () => {
    const cues = buildCues([
      { text: "   ", startMs: 0, endMs: 400 },
      { text: "backwards", startMs: 900, endMs: 100 },
      { text: "good", startMs: 1000, endMs: 1400 },
    ]);
    expect(cues).toHaveLength(1);
    expect(cueText(cues[0])).toBe("good");
  });

  it("returns nothing for nothing", () => {
    expect(buildCues([])).toEqual([]);
  });

  it("honours narrower line limits for a tighter canvas", () => {
    const cues = buildCues(say("one two three four five six"), { maxCharsPerLine: 8, maxLines: 1 });
    for (const c of cues) expect(c.lines[0].length).toBeLessThanOrEqual(8);
  });
});

describe("reading speed", () => {
  it("reports characters per second rather than enforcing it — the audio sets the pace", () => {
    const cue: Cue = { startMs: 0, endMs: 1000, lines: ["twelve chars"] };
    expect(charsPerSecond(cue)).toBe(12);
  });

  it("flags a cue nobody could read in time", () => {
    const fast: Cue = { startMs: 0, endMs: 1000, lines: ["far too many characters to read in a single second"] };
    const calm: Cue = { startMs: 0, endMs: 3000, lines: ["easy"] };
    expect(tooFastToRead([fast, calm])).toEqual([fast]);
  });
});

describe("srt / vtt", () => {
  const cues: Cue[] = [
    { startMs: 0, endMs: 1500, lines: ["Line one", "Line two"] },
    { startMs: 1500, endMs: 3250, lines: ["Second cue"] },
  ];

  it("uses a COMMA for SRT and a full stop for VTT — swapping them breaks silently", () => {
    expect(srtTime(1500)).toBe("00:00:01,500");
    expect(vttTime(1500)).toBe("00:00:01.500");
  });

  it("numbers SRT cues from one", () => {
    expect(toSrt(cues).startsWith("1\n00:00:00,000 --> 00:00:01,500\nLine one\nLine two")).toBe(true);
  });

  it("puts the WEBVTT header on a VTT file", () => {
    expect(toVtt(cues).startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("handles hours without overflowing the minutes field", () => {
    expect(srtTime(3_661_001)).toBe("01:01:01,001");
  });

  it("round-trips through SRT", () => {
    expect(parseCues(toSrt(cues))).toEqual(cues);
  });

  it("round-trips through VTT", () => {
    expect(parseCues(toVtt(cues))).toEqual(cues);
  });

  it("tolerates CRLF line endings, which is what a Windows editor writes", () => {
    expect(parseCues(toSrt(cues).replace(/\n/g, "\r\n"))).toEqual(cues);
  });

  it("skips a malformed cue instead of losing the whole file", () => {
    const broken = "1\nnot a timestamp\nnope\n\n2\n00:00:02,000 --> 00:00:03,000\nfine\n";
    expect(parseCues(broken)).toEqual([{ startMs: 2000, endMs: 3000, lines: ["fine"] }]);
  });
});

describe("ass", () => {
  const reels = specFor("meta_reels_9x16");
  const cues: Cue[] = [{ startMs: 0, endMs: 1500, lines: ["Hello", "there"] }];

  it("writes colours as &HAABBGGRR — BGR order, inverted alpha", () => {
    expect(assColour("#ff0000")).toBe("&H000000FF");
    expect(assColour("#0000ff")).toBe("&H00FF0000");
    expect(assColour("#fff")).toBe("&H00FFFFFF");
  });

  it("keeps CENTISECONDS, not milliseconds", () => {
    expect(assTime(1500)).toBe("0:00:01.50");
    expect(assTime(3_661_009)).toBe("1:01:01.01");
  });

  it("sets the bottom margin from the placement's SAFE ZONE, not by taste", () => {
    const style = styleForPlacement(reels);
    expect(style.marginBottomPx).toBe(Math.round(1920 * 0.35));
    expect(style.marginSidePx).toBe(Math.round(1080 * 0.06));
  });

  it("declares PlayRes matching the video, or libass rescales the margins away", () => {
    const ass = toAss({ cues, style: styleForPlacement(reels), width: 1080, height: 1920 });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
  });

  it("renders each cue as one Dialogue line with \\N between lines", () => {
    const ass = toAss({ cues, style: styleForPlacement(reels), width: 1080, height: 1920 });
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,Hello\\Nthere");
  });

  it("escapes braces so caption text cannot inject an ASS override tag", () => {
    expect(escapeAss("{\\an8}sneaky")).toBe("\\{\\\\an8\\}sneaky");
  });

  it("uses BorderStyle 3 for a box and 1 for an outline", () => {
    const box = toAss({ cues, style: styleForPlacement(reels, { border: "box" }), width: 1080, height: 1920 });
    const outline = toAss({ cues, style: styleForPlacement(reels), width: 1080, height: 1920 });
    expect(box).toMatch(/Style: Default,[^\n]*,3,/);
    expect(outline).toMatch(/Style: Default,[^\n]*,1,/);
  });
});

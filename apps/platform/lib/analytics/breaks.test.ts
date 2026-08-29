import { describe, expect, it } from "vitest";
import { METRICS, DEFINITIONS_VERSION } from "./metrics";
import { allBreaks, breaksInRange, definitionChangeNotes, isValidDay, PROVIDER_LABEL, PROVIDER_NETWORKS, seriesBreakMarkers, splitAtBreaks } from "./breaks";

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe("definition break registry", () => {
  const breaks = allBreaks();

  it("declares at least the Meta June 2026 retirement", () => {
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.some((b) => b.entry.provider === "meta" && b.entry.effectiveFrom === "2026-06-15")).toBe(true);
    expect(DEFINITIONS_VERSION).toBe("2026.08.2");
  });

  it("references only metrics that exist in the registry", () => {
    for (const b of breaks) {
      expect(METRICS[b.metric]).toBeDefined();
      expect(METRICS[b.metric].key).toBe(b.metric);
      expect(b.metricName).toBe(METRICS[b.metric].name);
    }
  });

  it("carries a valid effectiveFrom, a known provider and both definitions", () => {
    for (const { entry } of breaks) {
      expect(isValidDay(entry.effectiveFrom)).toBe(true);
      expect(PROVIDER_LABEL[entry.provider]).toBeTruthy();
      expect(PROVIDER_NETWORKS[entry.provider]?.length).toBeGreaterThan(0);
      expect(entry.previous.name).not.toBe(entry.next.name);
      expect(entry.previous.formula.length).toBeGreaterThan(0);
      expect(entry.next.formula.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(20);
    }
  });

  it("rejects impossible dates", () => {
    expect(isValidDay("2026-02-31")).toBe(false);
    expect(isValidDay("2026-6-15")).toBe(false);
    expect(isValidDay("2026-06-15")).toBe(true);
  });

  it("maps Meta's viewers metric and refuses comparability with reach", () => {
    expect(METRICS.viewers.providers.meta).toBeTruthy();
    expect(METRICS.viewers.caveat).toMatch(/not comparable to reach/i);
    expect(METRICS.viewers.unavailable).toBeTruthy();
    expect(METRICS.reach.providers.meta).toMatch(/retiring/i);
    expect(METRICS.reach.breaks?.[0].effectiveFrom).toBe("2026-06-15");
  });
});

describe("breaksInRange", () => {
  it("ignores a break before or after the range", () => {
    expect(breaksInRange("2026-07-01", "2026-07-31", ["reach"])).toHaveLength(0);
    expect(breaksInRange("2026-01-01", "2026-05-31", ["reach"])).toHaveLength(0);
  });

  it("ignores a break on the first day: the whole range is already the new definition", () => {
    expect(breaksInRange("2026-06-15", "2026-06-30", ["reach"])).toHaveLength(0);
  });

  it("reports a break strictly inside the range, up to and including the last day", () => {
    expect(breaksInRange("2026-06-01", "2026-06-30", ["reach"])).toHaveLength(1);
    expect(breaksInRange("2026-06-14", "2026-06-15", ["reach"])).toHaveLength(1);
  });
});

describe("chart split", () => {
  it("marks the first observed day at or after the break and splits there", () => {
    const d = days("2026-06-10", 10); // 10–19 June
    const markers = seriesBreakMarkers("reach", d);
    expect(markers).toHaveLength(1);
    expect(markers[0].day).toBe("2026-06-15");
    expect(markers[0].label).toBe("Definition changed — Meta");
    expect(markers[0].tooltip).toMatch(/media viewers/i);
    const runs = splitAtBreaks(d, markers);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual(days("2026-06-10", 5));
    expect(runs[1]).toEqual(days("2026-06-15", 5));
    expect(runs.flat()).toEqual(d);
  });

  it("splits on the next observed day when the break day itself has no facts", () => {
    const d = ["2026-06-12", "2026-06-13", "2026-06-18", "2026-06-19"];
    const markers = seriesBreakMarkers("reach", d);
    expect(markers[0].day).toBe("2026-06-18");
    expect(splitAtBreaks(d, markers)).toEqual([["2026-06-12", "2026-06-13"], ["2026-06-18", "2026-06-19"]]);
  });

  it("leaves an unaffected metric and an unaffected range as one run", () => {
    const d = days("2026-06-10", 10);
    expect(seriesBreakMarkers("engagement", d)).toHaveLength(0);
    expect(splitAtBreaks(d, [])).toEqual([d]);
    expect(seriesBreakMarkers("reach", days("2026-07-01", 10))).toHaveLength(0);
  });

  it("never marks a break at the very start of the observed series", () => {
    const d = days("2026-06-15", 5);
    expect(seriesBreakMarkers("reach", d)).toHaveLength(0);
    expect(splitAtBreaks(d, [])).toEqual([d]);
  });

  it("accepts unsorted input", () => {
    const d = [...days("2026-06-10", 10)].reverse();
    expect(seriesBreakMarkers("reach", d)[0].day).toBe("2026-06-15");
  });
});

describe("definitionChangeNotes", () => {
  it("names the metric, provider, date and both definitions", () => {
    const [note] = definitionChangeNotes("2026-06-01", "2026-06-30", ["reach"]);
    expect(note).toMatch(/^Reach \(Meta\), 2026-06-15: /);
    expect(note).toMatch(/unique impressions.*→.*unique media viewers/);
  });

  it("is empty when nothing changed in the range", () => {
    expect(definitionChangeNotes("2026-07-01", "2026-07-31")).toEqual([]);
  });
});

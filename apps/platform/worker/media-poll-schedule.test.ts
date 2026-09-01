/*
 * The bug this file exists for: media.generate emits exactly ONE media.poll per
 * job, and a clip is always still rendering when it fires. Nothing called the
 * sweep on a timer, so every generation stranded — vendor finished, delivery URL
 * expired, money spent on a file nobody collected (docs/bugs/B-008).
 *
 * A handler nobody calls is invisible to a handler test, so this reads the
 * wiring itself — the same approach as worker/imports.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deliveryWindowClosed } from "../lib/media/delivery-window";

const source = (p: string) => readFileSync(join(__dirname, p), "utf8");

describe("something must ask for the sweep on a timer", () => {
  it("CALLS it on a ticker, not merely imports it", () => {
    // An import alone passed this while the tick was deleted, which is the
    // whole failure mode: the code exists and nothing runs it.
    expect(source("schedules.ts")).toMatch(/every\([^)]*enqueueMediaPolls\)/);
  });

  it("ticks faster than a clip takes to render, or the first poll is still the only one that matters", () => {
    const s = source("schedules.ts");
    const call = s.match(/every\((\d[\d_]*), [\d_]+, "media poll enqueue"/);
    expect(call).not.toBeNull();
    // A Sora clip lands in about a minute; anything slower than that and the
    // delivery window is being spent on waiting rather than fetching.
    expect(Number(call![1].replace(/_/g, ""))).toBeLessThanOrEqual(30_000);
  });
});

describe("a job that never finishes stops being a spinner", () => {
  const aged = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  it("keeps polling inside the window — this is the normal case", () => {
    expect(deliveryWindowClosed(aged(1), 86_400)).toBe(false);
  });

  it("gives up once the bytes are provably gone", () => {
    expect(deliveryWindowClosed(aged(25), 86_400)).toBe(true);
  });

  it("falls back to a day when a model declares no TTL, rather than giving up at once", () => {
    expect(deliveryWindowClosed(aged(2), undefined)).toBe(false);
    expect(deliveryWindowClosed(aged(25), undefined)).toBe(true);
  });
});

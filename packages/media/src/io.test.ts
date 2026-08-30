import { describe, expect, it } from "vitest";
import { modelByKey, describeCatalog, modelsForJob } from "./catalog";
import { CHECKED_AT_MAX_AGE_DAYS, isStale, nearestDuration, referenceCapacity, supportsDuration } from "./io";

const video = () => modelByKey("mock-video")!;
const audio = () => modelByKey("mock-audio")!;

describe("supportsDuration", () => {
  it("accepts only the values a fixed-duration model declares", () => {
    expect(supportsDuration(video().io, 8)).toBe(true);
    expect(supportsDuration(video().io, 7)).toBe(false);
  });

  it("accepts anything in range for a range model", () => {
    expect(supportsDuration(audio().io, 42)).toBe(true);
    expect(supportsDuration(audio().io, 900)).toBe(false);
  });

  it("treats an unspecified duration as supported", () => {
    expect(supportsDuration(video().io, undefined)).toBe(true);
  });

  it("rejects a duration on a model that declares none", () => {
    expect(supportsDuration(modelByKey("mock-image")!.io, 5)).toBe(false);
  });
});

describe("nearestDuration", () => {
  it("snaps to the closest allowed value", () => {
    expect(nearestDuration(video().io, 7)).toBe(8);
    expect(nearestDuration(video().io, 5)).toBe(4);
  });

  it("clamps into range for a range model", () => {
    expect(nearestDuration(audio().io, 900)).toBe(300);
    expect(nearestDuration(audio().io, 0)).toBe(1);
  });

  it("returns null when a model has no duration at all", () => {
    expect(nearestDuration(modelByKey("mock-image")!.io, 5)).toBeNull();
  });
});

describe("referenceCapacity", () => {
  it("reports what each model will actually take, so callers downsample honestly", () => {
    expect(referenceCapacity(video().io)).toEqual({ images: 3, videos: 0, audio: 0 });
    expect(referenceCapacity(modelByKey("mock-image")!.io)).toEqual({ images: 9, videos: 0, audio: 0 });
    expect(referenceCapacity(audio().io)).toEqual({ images: 0, videos: 0, audio: 0 });
  });
});

describe("isStale", () => {
  const m = video();

  it("is fresh when recently checked", () => {
    expect(isStale(m, new Date(m.checkedAt))).toBe(false);
  });

  it("goes stale past the age limit, so a capability claim cannot rot unnoticed", () => {
    const later = new Date(new Date(m.checkedAt).getTime() + (CHECKED_AT_MAX_AGE_DAYS + 1) * 86_400_000);
    expect(isStale(m, later)).toBe(true);
  });

  it("treats an unparseable checkedAt as stale rather than fresh", () => {
    expect(isStale({ ...m, checkedAt: "not a date" })).toBe(true);
  });
});

describe("catalog", () => {
  it("offers a model for every job kind it claims", () => {
    for (const m of [video(), audio(), modelByKey("mock-image")!]) {
      for (const job of m.jobs) expect(modelsForJob(job).map((x) => x.key)).toContain(m.key);
    }
  });

  it("explains an unconfigured adapter rather than hiding the model", () => {
    const entry = describeCatalog(() => false).find((e) => e.key === "mock-video")!;
    expect(entry.configured).toBe(false);
    expect(entry.unavailableReason).toContain("isn't configured");
  });

  it("reports no reason when a model is ready", () => {
    const entry = describeCatalog(() => true).find((e) => e.key === "mock-video")!;
    expect(entry.unavailableReason).toBeNull();
  });

  it("resolves a retired model by key, so historic jobs still read back", () => {
    expect(modelByKey("mock-video")?.label).toBe("Mock video");
  });

  it("pins vendor model ids as literals, never constructed", () => {
    expect(video().vendorModelId).toBe("mock-video-1");
  });
});

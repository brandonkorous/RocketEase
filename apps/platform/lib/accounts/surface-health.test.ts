import { describe, expect, it } from "vitest";
import { surfaceDowngrade } from "./surface-health";

describe("surfaceDowngrade", () => {
  it("stops a channel claiming success while a surface is failing", () => {
    const r = surfaceDowngrade("success", [{ resource: "insights", lastError: "validation: (#100) bad metric" }]);
    expect(r).toEqual({ tone: "warning", detail: "Insights is not syncing" });
  });

  it("names every failing surface", () => {
    const r = surfaceDowngrade("success", [
      { resource: "insights", lastError: "boom" },
      { resource: "inbox", lastError: "boom" },
    ]);
    expect(r?.detail).toBe("Insights and Inbox are not syncing");
  });

  it("leaves a healthy channel alone", () => {
    expect(surfaceDowngrade("success", [{ resource: "insights", lastError: null }])).toBeNull();
    expect(surfaceDowngrade("success", [])).toBeNull();
  });

  it("never masks a more urgent problem", () => {
    expect(surfaceDowngrade("error", [{ resource: "insights", lastError: "boom" }])).toBeNull();
    expect(surfaceDowngrade("warning", [{ resource: "insights", lastError: "boom" }])).toBeNull();
  });

  it("does not treat a retired provider metric as a fault", () => {
    const note = "Jotacular: facebook no longer reports page_video_views. Every other metric is up to date.";
    expect(surfaceDowngrade("success", [{ resource: "insights", lastError: note }])).toBeNull();
  });
});

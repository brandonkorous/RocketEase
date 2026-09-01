import { describe, expect, it } from "vitest";
import { routeJob } from "@rocketease/media";
import { conceptImageSpec, MAX_IMAGES } from "./image-spec";

describe("conceptImageSpec", () => {
  it("asks for a scene still — not a product still, which is a different model", () => {
    expect(conceptImageSpec("a street", { aspect: "square", count: 1 }, null).jobKind).toBe("scene_still");
  });

  it("translates the composer's words into aspects we actually publish at", () => {
    const aspect = (a: "square" | "portrait" | "landscape") => conceptImageSpec("x", { aspect: a, count: 1 }, null).aspect;
    // 3:2 and 2:3 fit no placement in canvas/specs.ts. 9:16 fits three.
    expect([aspect("square"), aspect("portrait"), aspect("landscape")]).toEqual(["1:1", "9:16", "16:9"]);
  });

  it("clamps the count rather than sending a number no model accepts", () => {
    expect(conceptImageSpec("x", { aspect: "square", count: 99 }, null).count).toBe(MAX_IMAGES);
    expect(conceptImageSpec("x", { aspect: "square", count: 0 }, null).count).toBe(1);
  });

  it("carries alt text on the spec, so a job finished later still lands with it", () => {
    expect(conceptImageSpec("x", { aspect: "square", count: 1 }, "a quiet street").altText).toBe("a quiet street");
    expect(conceptImageSpec("x", { aspect: "square", count: 1 }, null).altText).toBeUndefined();
  });

  it("routes on Azure for every aspect the composer offers", () => {
    for (const a of ["square", "portrait", "landscape"] as const) {
      const spec = conceptImageSpec("a street", { aspect: a, count: 1 }, null);
      const r = routeJob(spec, { isConfigured: (k) => k === "azure-openai" });
      expect(r, a).toHaveProperty("model");
    }
  });

  it("REFUSES honestly on gpt-image-1, which cannot render a 9:16 frame", () => {
    const spec = conceptImageSpec("a street", { aspect: "portrait", count: 1 }, null);
    const r = routeJob(spec, { isConfigured: (k) => k === "openai" });
    expect(r).not.toHaveProperty("model");
    expect("error" in r && r.error).toContain("not 9:16");
  });

  it("still serves a square on the direct vendor", () => {
    const spec = conceptImageSpec("a street", { aspect: "square", count: 1 }, null);
    expect(routeJob(spec, { isConfigured: (k) => k === "openai" })).toHaveProperty("model");
  });
});

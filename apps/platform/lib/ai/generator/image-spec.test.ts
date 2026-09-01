import { describe, expect, it } from "vitest";
import { routeJob } from "@rocketease/media";
import { conceptImageSpec, MAX_IMAGES } from "./image-spec";

describe("conceptImageSpec", () => {
  it("asks for a scene still — not a product still, which is a different model", () => {
    expect(conceptImageSpec("a street", { aspect: "square", count: 1 }, null).jobKind).toBe("scene_still");
  });

  it("translates the composer's words into the registry's aspect vocabulary", () => {
    const aspect = (a: "square" | "portrait" | "landscape") => conceptImageSpec("x", { aspect: a, count: 1 }, null).aspect;
    expect([aspect("square"), aspect("landscape"), aspect("portrait")]).toEqual(["1:1", "3:2", "2:3"]);
  });

  it("clamps the count rather than sending a number no model accepts", () => {
    expect(conceptImageSpec("x", { aspect: "square", count: 99 }, null).count).toBe(MAX_IMAGES);
    expect(conceptImageSpec("x", { aspect: "square", count: 0 }, null).count).toBe(1);
  });

  it("carries alt text on the spec, so a job finished later still lands with it", () => {
    expect(conceptImageSpec("x", { aspect: "square", count: 1 }, "a quiet street").altText).toBe("a quiet street");
    expect(conceptImageSpec("x", { aspect: "square", count: 1 }, null).altText).toBeUndefined();
  });

  it("produces a spec every configured image model will actually accept", () => {
    for (const a of ["square", "portrait", "landscape"] as const) {
      const spec = conceptImageSpec("a street", { aspect: a, count: 1 }, null);
      for (const adapter of ["mock", "openai"]) {
        const r = routeJob(spec, { isConfigured: (k) => k === adapter });
        expect(r, `${a} on ${adapter}`).toHaveProperty("model");
      }
    }
  });
});

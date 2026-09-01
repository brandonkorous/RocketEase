/*
 * The estimate reports what this workspace has ACTUALLY been charged. The rule
 * that matters: it says nothing rather than quoting a rate (docs/bugs/B-004).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = { value: [] as { credits: string | null; quantity: string | null }[] };

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => rows.value }) }) }),
    }),
  },
}));

const { imageUnitEstimate } = await import("./estimate");

beforeEach(() => {
  rows.value = [];
});

describe("imageUnitEstimate", () => {
  it("says nothing at all when the workspace has generated nothing", async () => {
    expect(await imageUnitEstimate("ws1")).toBeNull();
  });

  it("reports the median credits per image", async () => {
    rows.value = [
      { credits: "1.0000", quantity: "1" },
      { credits: "2.0000", quantity: "1" },
      { credits: "9.0000", quantity: "1" },
    ];
    expect(await imageUnitEstimate("ws1")).toBe("About 2 credits per image, from your recent generations.");
  });

  it("divides by the images a job actually produced", async () => {
    rows.value = [{ credits: "8.0000", quantity: "4" }];
    expect(await imageUnitEstimate("ws1")).toBe("About 2 credits per image, from your recent generations.");
  });

  it("uses the median so one busy picture does not move the figure", async () => {
    // A mean would report 25.5; the median stays where most images sit.
    rows.value = [
      { credits: "1.0000", quantity: "1" },
      { credits: "1.0000", quantity: "1" },
      { credits: "2.0000", quantity: "1" },
      { credits: "98.0000", quantity: "1" },
    ];
    expect(await imageUnitEstimate("ws1")).toBe("About 1.5 credits per image, from your recent generations.");
  });

  it("ignores rows it cannot read rather than counting them as free", async () => {
    rows.value = [{ credits: "not a number", quantity: "1" }, { credits: "3.0000", quantity: "1" }];
    expect(await imageUnitEstimate("ws1")).toBe("About 3 credits per image, from your recent generations.");
  });

  it("treats a missing quantity as one image, never as a divide by zero", async () => {
    rows.value = [{ credits: "4.0000", quantity: null }];
    expect(await imageUnitEstimate("ws1")).toBe("About 4 credits per image, from your recent generations.");
  });
});

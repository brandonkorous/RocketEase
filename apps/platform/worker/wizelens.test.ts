import { describe, expect, it } from "vitest";
import { startWizeLens, traceJob } from "./wizelens";

describe("worker WizeLens", () => {
  it("stays off in tests and still runs the job", async () => {
    await startWizeLens("general");
    await expect(traceJob("inbox.sync", "j1", {}, async () => 42)).resolves.toBe(42);
  });

  it("passes a job failure through unchanged", async () => {
    const err = new Error("network down");
    await expect(traceJob("inbox.sync", "j2", {}, async () => Promise.reject(err))).rejects.toBe(err);
  });
});

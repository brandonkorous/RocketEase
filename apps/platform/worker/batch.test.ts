import { describe, expect, it } from "vitest";
import { runBatch } from "./batch";

describe("runBatch", () => {
  it("fails only the job that threw and still runs the rest", async () => {
    const done: string[] = [];
    const failed: string[] = [];
    const jobs = [{ id: "1" }, { id: "2" }, { id: "3" }];
    await runBatch(
      jobs,
      async (j) => {
        if (j.id === "2") throw new Error("boom");
        done.push(j.id);
      },
      async (j) => void failed.push(j.id),
    );
    expect(done).toEqual(["1", "3"]);
    expect(failed).toEqual(["2"]);
  });
});

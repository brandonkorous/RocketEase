import { describe, expect, it } from "vitest";
import { JOB_NAMES, QUEUES, WORKER_ROLES, queuesForRole, roleOf } from "./queues";

describe("worker roles", () => {
  it("gives every queue to exactly one role — a queue owned by neither is silently dropped", () => {
    const covered = WORKER_ROLES.flatMap((r) => queuesForRole(r));
    expect([...covered].sort()).toEqual([...JOB_NAMES].sort());
    expect(new Set(covered).size).toBe(JOB_NAMES.length);
  });

  it("defaults an unmarked queue to the general worker", () => {
    expect(roleOf("publish.execute")).toBe("general");
    expect(roleOf("inbox.sync")).toBe("general");
  });

  it("puts ffmpeg work on the media worker — asset.process runs probes and poster frames now", () => {
    expect(roleOf("asset.process")).toBe("media");
  });

  it("puts generation and polling on the media worker", () => {
    expect(roleOf("media.generate")).toBe("media");
    expect(roleOf("media.poll")).toBe("media");
  });

  it("keeps the media worker's set small and deliberate", () => {
    expect([...queuesForRole("media")].sort()).toEqual(["asset.process", "media.generate", "media.poll"]);
  });
});

describe("spend queues", () => {
  it("never retries a generation blindly — the handler decides after reconciliation", () => {
    expect(QUEUES["media.generate"].retryLimit).toBe(0);
    expect(QUEUES["media.generate"].policy).toBe("stately");
  });

  it("matches the discipline publishing and promotions already follow", () => {
    expect(QUEUES["publish.execute"].retryLimit).toBe(0);
    expect(QUEUES["promotion.execute"].policy).toBe("stately");
  });

  it("polls tightly, because vendor output URLs expire", () => {
    expect(QUEUES["media.poll"].retryDelay).toBeLessThanOrEqual(30);
  });
});

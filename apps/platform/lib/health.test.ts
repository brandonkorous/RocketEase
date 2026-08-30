import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: { execute } }));

const { connectionHeadroom, readiness, timed } = await import("./health");

// Braces matter: an arrow returning mockReset()'s value hands vitest the mock
// itself, which it then calls as a teardown hook.
beforeEach(() => {
  execute.mockReset();
});

describe("readiness", () => {
  it("is ready when both queries go through the application pool", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    const r = await readiness();
    expect(r.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("is not ready when this replica cannot get a connection", async () => {
    // What the starved pod actually saw on 2026-08-30.
    execute.mockRejectedValue(Object.assign(new Error("remaining connection slots are reserved"), { name: "PostgresError" }));
    const r = await readiness();
    expect(r.ok).toBe(false);
    expect(r.checks.db.status).toBe("fail");
  });

  it("is not ready when the queue schema is gone even though the database answers", async () => {
    // readiness() issues `select 1` first, then the pgboss probe.
    execute.mockResolvedValueOnce([{}]).mockRejectedValueOnce(new Error("no schema"));
    expect((await readiness()).ok).toBe(false);
  });
});

describe("timed", () => {
  it("names the error class and never the message", async () => {
    const c = await timed(() => Promise.reject(Object.assign(new Error("host=db user=rke password=hunter2"), { name: "PostgresError" })));
    expect(c).toMatchObject({ status: "fail", detail: "PostgresError" });
    expect(JSON.stringify(c)).not.toContain("hunter2");
  });

  it("fails on its own budget rather than waiting for a hung query", async () => {
    const c = await timed(() => new Promise(() => {}), 10);
    expect(c).toMatchObject({ status: "fail", detail: "Error" });
  });
});

describe("connectionHeadroom", () => {
  const headroom = (max: number, used: number) => execute.mockResolvedValue([{ max, used }]);

  it("reports free slots when the server has room", async () => {
    headroom(50, 32);
    expect(await connectionHeadroom()).toEqual({ status: "ok", max: 50, used: 32, free: 18 });
  });

  it("calls the server low before it runs out, not after", async () => {
    headroom(50, 48);
    expect(await connectionHeadroom()).toMatchObject({ status: "low", free: 2 });
  });

  it("says unknown rather than guessing when the query fails", async () => {
    execute.mockRejectedValue(new Error("permission denied for pg_stat_activity"));
    expect(await connectionHeadroom()).toMatchObject({ status: "unknown" });
  });

  it("says unknown rather than 0 when the server reports nothing", async () => {
    execute.mockResolvedValue([{ max: null, used: null }]);
    expect(await connectionHeadroom()).toEqual({ status: "unknown", detail: "not reported" });
  });
});

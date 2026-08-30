import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapGraphError } from "./graph";

const graph = vi.hoisted(() => vi.fn());
vi.mock("./graph", async (orig) => ({ ...(await orig<typeof import("./graph")>()), graph }));

const { fetchInsights } = await import("./insights");

const cfg = { clientId: "x", clientSecret: "y", redirectUri: "z" } as never;
const cred = { accessToken: "tok" } as never;
const page = { id: "c1", remoteId: "123", kind: "facebook_page" } as never;
const req = { since: "2026-08-01", until: "2026-08-07" };

/** Meta's response when one name in the metric list is not valid for the object. */
const retired = () => mapGraphError(400, { error: { message: "(#100) The value must be a valid insights metric", code: 100 } });

/** Metric names a given graph() call asked for. */
const askedIn = (args: unknown[]): string[] => {
  const params = (args[3] as { params?: Record<string, string> } | undefined)?.params;
  return params?.metric ? params.metric.split(",") : [];
};

// Braces matter: an arrow returning mockReset()'s value hands vitest the mock
// itself, which it then calls as a teardown hook.
beforeEach(() => {
  graph.mockReset();
});

/** One graph() reply carrying whichever of `named` the call asked for. */
const replyWith = (named: Record<string, number[]>) => async (...args: unknown[]) => ({
  data: askedIn(args)
    .filter((m) => named[m])
    .map((m) => ({ name: m, values: named[m].map((value, i) => ({ value, end_time: `2026-08-0${i + 2}T07:00:00+0000` })) })),
});

describe("fetchInsights — Meta's successor metric names", () => {
  it("asks for the names Meta still has, and for none it retired", async () => {
    graph.mockImplementation(replyWith({}));

    await fetchInsights(cfg, cred, page, req);

    const asked = askedIn(graph.mock.calls[0]);
    for (const dead of ["page_impressions", "page_impressions_unique", "page_fans", "page_fan_adds", "page_consumptions_by_consumption_type"]) {
      expect(asked, dead).not.toContain(dead);
    }
    expect(asked).toEqual(expect.arrayContaining(["page_media_view", "page_total_media_view_unique", "page_follows"]));
  });

  it("lands unique media views on viewers, never on reach", async () => {
    graph.mockImplementation(replyWith({ page_total_media_view_unique: [40] }));

    const out = await fetchInsights(cfg, cred, page, req);

    expect(out.facts.map((f) => f.metric)).toEqual(["viewers"]);
    expect(out.facts[0].source).toBe("meta.page_total_media_view_unique");
  });

  it("reports follower growth net of unfollows", async () => {
    graph.mockImplementation(replyWith({ page_daily_follows_unique: [10, 4], page_daily_unfollows_unique: [3, 6] }));

    const out = await fetchInsights(cfg, cred, page, req);

    expect(out.facts.filter((f) => f.metric === "follower_gain").map((f) => f.value)).toEqual([7, -2]);
  });

  it("reports no growth at all rather than passing gross follows off as net", async () => {
    graph.mockImplementation(replyWith({ page_daily_follows_unique: [10] }));

    const out = await fetchInsights(cfg, cred, page, req);

    expect(out.facts.some((f) => f.metric === "follower_gain")).toBe(false);
  });
});

describe("fetchInsights — a retired Meta metric", () => {
  it("does not let one dead name zero out the others", async () => {
    graph.mockImplementation(async (...args: unknown[]) => {
      const asked = askedIn(args);
      if (asked.length > 1) throw retired(); // Meta rejects the whole batch
      if (asked[0] === "page_video_views") throw retired(); // this one is genuinely gone
      return { data: [{ name: asked[0], values: [{ value: 7, end_time: "2026-08-02T07:00:00+0000" }] }] };
    });

    const out = await fetchInsights(cfg, cred, page, req);

    const sources = out.facts.map((f) => f.source);
    expect(sources).toContain("meta.page_media_view");
    expect(sources).toContain("meta.page_post_engagements");
    expect(sources).not.toContain("meta.page_video_views");
    expect(out.unsupportedMetrics).toEqual(["page_video_views"]);
  });

  it("asks for the whole list in one call when nothing is retired", async () => {
    graph.mockResolvedValue({ data: [{ name: "page_media_view", values: [{ value: 3, end_time: "2026-08-02T07:00:00+0000" }] }] });

    const out = await fetchInsights(cfg, cred, page, req);

    expect(graph).toHaveBeenCalledTimes(1);
    expect(askedIn(graph.mock.calls[0]).length).toBeGreaterThan(1);
    expect(out.unsupportedMetrics).toBeUndefined();
  });

  it("still throws on a real failure, so auth problems are not mistaken for retirement", async () => {
    const authError = mapGraphError(400, { error: { message: "Error validating access token", code: 190 } });
    graph.mockImplementation(() => Promise.reject(authError));

    let caught: unknown = null;
    try {
      await fetchInsights(cfg, cred, page, req);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(authError);
    expect(graph).toHaveBeenCalledTimes(1); // not retried metric-by-metric
  });
});

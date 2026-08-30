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
    expect(sources).toContain("meta.page_impressions");
    expect(sources).toContain("meta.page_post_engagements");
    expect(sources).not.toContain("meta.page_video_views");
    expect(out.unsupportedMetrics).toEqual(["page_video_views"]);
  });

  it("asks for the whole list in one call when nothing is retired", async () => {
    graph.mockResolvedValue({ data: [{ name: "page_impressions", values: [{ value: 3, end_time: "2026-08-02T07:00:00+0000" }] }] });

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

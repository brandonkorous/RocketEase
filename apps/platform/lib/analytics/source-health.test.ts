import { describe, expect, it } from "vitest";
import { explainSyncError } from "./source-health";

describe("explainSyncError", () => {
  it("never shows a raw provider code to a person", () => {
    const r = explainSyncError("validation: (#100) The value must be a valid insights metric");
    expect(r.headline).not.toMatch(/#100|validation/);
    expect(r.headline).toBe("The network rejected part of what we asked for.");
    expect(r.action).toContain("the rest still updates");
  });

  it("tells you to reconnect when permission is gone", () => {
    expect(explainSyncError("permission: Error validating access token")).toEqual({
      headline: "The connection lost permission.",
      action: "Reconnect the account.",
    });
  });

  it("says a rate limit needs nothing from you", () => {
    expect(explainSyncError("rate_limit: too many calls").action).toBe("It will catch up on its own.");
  });

  it("passes our own plain sentence through unchanged", () => {
    const ours = "Jotacular: facebook rejected these metric names — page_video_views. Every other metric is up to date.";
    expect(explainSyncError(ours)).toEqual({ headline: ours, action: null });
  });

  it("covers no error at all", () => {
    expect(explainSyncError(null).headline).toBe("Has not synced recently.");
  });

  it("falls back without leaking the raw string", () => {
    const r = explainSyncError("ECONNRESET at socket layer 0x9f");
    expect(r.headline).toBe("The last sync did not finish.");
    expect(r.headline).not.toContain("0x9f");
  });
});

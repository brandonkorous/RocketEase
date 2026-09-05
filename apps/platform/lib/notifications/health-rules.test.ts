import { describe, expect, it } from "vitest";
import { healthBody, healthTitle, needsHealthNotice } from "./health-rules";

const ch = { name: "Piggles", network: "instagram", handle: "@meetpiggles", workspaceId: "ws", organizationId: "org" };

describe("connection health notices", () => {
  it("fire on the way into a broken state, and only then", () => {
    expect(needsHealthNotice("healthy", "action_required")).toBe(true);
    expect(needsHealthNotice("degraded", "revoked")).toBe(true);
    expect(needsHealthNotice("syncing", "action_required")).toBe(true);
    // Already broken: staying broken, or moving between broken states, is not news.
    expect(needsHealthNotice("action_required", "action_required")).toBe(false);
    expect(needsHealthNotice("action_required", "revoked")).toBe(false);
    // Recovering is shown on the accounts screen, not announced.
    expect(needsHealthNotice("action_required", "healthy")).toBe(false);
    expect(needsHealthNotice("healthy", "degraded")).toBe(false);
  });

  it("names the profile and the network, and says what happens to scheduled posts", () => {
    expect(healthTitle(ch, "action_required")).toBe("@meetpiggles on Instagram needs to be reconnected");
    expect(healthTitle({ ...ch, handle: null }, "revoked")).toBe("Piggles on Instagram revoked RocketEase's access");
    expect(healthBody("action_required", "The token expired")).toBe("The token expired. Posts scheduled to this profile will wait until it is reconnected.");
    expect(healthBody("revoked")).toBe("Nothing more will publish there until it is connected again.");
  });
});

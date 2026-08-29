import { describe, expect, test, vi } from "vitest";

// The maths under test is pure; the module still reaches for the pool at import.
vi.mock("@/db", () => ({ db: {} }));
import { computeEntitlements, FREE_WORKSPACES } from "./entitlements";
import { GRACE_DAYS } from "./plans";

const NOW = new Date("2026-06-15T12:00:00Z");
const opts = { configured: true, includedCredits: 200 };

const sub = (over: Partial<Parameters<typeof computeEntitlements>[0] & object> = {}) => ({
  status: "active" as const,
  workspaceQuantity: 3,
  currentPeriodEnd: new Date("2026-07-01T00:00:00Z"),
  trialEnd: null,
  includedAiCreditsPerWorkspace: 200,
  updatedAt: NOW,
  ...over,
});

describe("entitlements", () => {
  test("an unconfigured deployment gates nothing and charges nothing", () => {
    const e = computeEntitlements(null, NOW, { ...opts, configured: false });
    expect(e).toMatchObject({ state: "unconfigured", active: true, workspacesAllowed: null });
  });

  test("no subscription still allows the first workspace", () => {
    const e = computeEntitlements(null, NOW, opts);
    expect(e.active).toBe(false);
    expect(e.workspacesAllowed).toBe(FREE_WORKSPACES);
    expect(e.aiCreditsPerWorkspace).toBe(0);
  });

  test("active and trialing are unlimited — each workspace simply joins the bill", () => {
    for (const status of ["active", "trialing"] as const) {
      const e = computeEntitlements(sub({ status }), NOW, opts);
      expect(e.active).toBe(true);
      expect(e.workspacesAllowed).toBeNull();
      expect(e.trialing).toBe(status === "trialing");
      expect(e.aiCreditsPerWorkspace).toBe(200);
    }
  });

  test("a failed payment keeps working for the grace period, then stops new work", () => {
    const periodEnd = new Date("2026-06-10T00:00:00Z");
    const inside = computeEntitlements(sub({ status: "past_due", currentPeriodEnd: periodEnd }), NOW, opts);
    expect(inside.active).toBe(true);
    expect(inside.inGrace).toBe(true);
    expect(inside.gracefulUntil).toEqual(new Date(periodEnd.getTime() + GRACE_DAYS * 86_400_000));
    // No new workspaces during grace: the bill is already failing.
    expect(inside.workspacesAllowed).toBe(3);

    const after = computeEntitlements(sub({ status: "past_due", currentPeriodEnd: periodEnd }), new Date("2026-06-20T00:00:00Z"), opts);
    expect(after.active).toBe(false);
    expect(after.inGrace).toBe(false);
  });

  test("grace falls back to the last sync when Stripe gave us no period end", () => {
    const e = computeEntitlements(sub({ status: "unpaid", currentPeriodEnd: null, updatedAt: NOW }), NOW, opts);
    expect(e.gracefulUntil).toEqual(new Date(NOW.getTime() + GRACE_DAYS * 86_400_000));
  });

  test("a canceled subscription blocks new work but never hides existing data", () => {
    const e = computeEntitlements(sub({ status: "canceled" }), NOW, opts);
    expect(e).toMatchObject({ active: false, inGrace: false, workspacesAllowed: 3 });
    // Credits stay reported so the last invoice and the usage page still add up.
    expect(e.aiCreditsPerWorkspace).toBe(200);
  });

  test("a subscription synced before an allowance existed falls back to the env default", () => {
    const e = computeEntitlements(sub({ includedAiCreditsPerWorkspace: 0 }), NOW, opts);
    expect(e.aiCreditsPerWorkspace).toBe(200);
  });
});

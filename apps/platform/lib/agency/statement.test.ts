import { describe, expect, it } from "vitest";
import { money, unknownMoney, type ClientRate, type MarginInput } from "./margin";
import { AD_SPEND_CURRENCY, NOTHING_TO_BILL, buildStatement, statusFromInvoice } from "./statement";

const rate = (over: Partial<ClientRate> = {}): ClientRate => ({ billingModel: "retainer", currency: "USD", retainerCents: 250_000, perPostCents: null, hourlyCents: null, adSpendMarkupBps: null, aiCreditMarkupBps: null, note: "", ...over });
const input = (over: Partial<MarginInput> = {}): MarginInput => ({ workspaceId: "w1", workspaceName: "Acme", currency: "USD", platformShare: money(4900), aiCost: money(1200), aiCreditsUsed: 40, aiCreditsReason: null, adSpend: money(100_000), postsPublished: 12, conversationsHandled: 3, rate: rate(), ...over });

describe("buildStatement", () => {
  it("bills a retainer as one line", () => {
    const b = buildStatement(input(), "September 2026");
    expect(b).toEqual({ ok: true, draft: { currency: "USD", totalCents: 250_000, lines: [{ kind: "fee", description: "Retainer — September 2026", quantity: 1, unitCents: 250_000, cents: 250_000 }] } });
  });

  it("bills per post as quantity × rate, and adds rebilled ad spend and AI at their markups", () => {
    const b = buildStatement(input({ rate: rate({ billingModel: "per_post", perPostCents: 15_000, adSpendMarkupBps: 1500, aiCreditMarkupBps: 5000 }) }), "September 2026");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.draft.lines.map((l) => [l.kind, l.quantity, l.unitCents, l.cents])).toEqual([["fee", 12, 15_000, 180_000], ["ad_spend", 1, 115_000, 115_000], ["ai", 1, 1800, 1800]]);
    expect(b.draft.lines[1].description).toBe("Ad spend rebilled at +15% — September 2026");
    expect(b.draft.lines[2].description).toBe("AI usage rebilled at +50% — 40 credits, September 2026");
    expect(b.draft.totalCents).toBe(296_800);
  });

  it("blocks with the reason when a rebilled input is unknown, and when the rate is missing or hourly", () => {
    expect(buildStatement(input({ rate: null }), "x")).toMatchObject({ ok: false, blocked: expect.stringMatching(/No rate is set/) });
    expect(buildStatement(input({ rate: rate({ billingModel: "hourly", hourlyCents: 10_000 }) }), "x")).toMatchObject({ ok: false, blocked: expect.stringMatching(/hourly/) });
    expect(buildStatement(input({ rate: rate({ adSpendMarkupBps: 1000 }), adSpend: unknownMoney("No ad account is connected.") }), "x")).toEqual({ ok: false, blocked: "No ad account is connected." });
  });

  it("refuses a zero statement and an ad-spend currency that differs from the rate's", () => {
    expect(buildStatement(input({ rate: rate({ billingModel: "per_post", perPostCents: 15_000 }), postsPublished: 0 }), "x")).toEqual({ ok: false, blocked: NOTHING_TO_BILL });
    expect(buildStatement(input({ rate: rate({ adSpendMarkupBps: 1000 }), currency: "EUR" }), "x")).toEqual({ ok: false, blocked: AD_SPEND_CURRENCY });
    // Zero ad spend in another currency is not a conflict: there is nothing to rebill.
    expect(buildStatement(input({ rate: rate({ adSpendMarkupBps: 1000 }), currency: "EUR", adSpend: money(0) }), "x").ok).toBe(true);
  });

  it("mirrors Stripe's invoice states", () => {
    expect(["draft", "open", "paid", "void", "uncollectible", null].map(statusFromInvoice)).toEqual(["draft", "sent", "paid", "void", "uncollectible", "draft"]);
  });
});

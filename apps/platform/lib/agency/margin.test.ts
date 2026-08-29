import { describe, expect, it } from "vitest";
import {
  addMoney,
  computeMargin,
  formatMoney,
  formatPct,
  HOURS_NOT_TRACKED,
  marginTotals,
  MIXED_CURRENCY,
  money,
  NO_PER_POST_RATE,
  NO_RATE,
  unknownMoney,
  withMarkup,
  type ClientRate,
  type MarginInput,
} from "./margin";

const rate = (over: Partial<ClientRate> = {}): ClientRate => ({
  billingModel: "retainer",
  currency: "USD",
  retainerCents: 250_000,
  perPostCents: null,
  hourlyCents: null,
  adSpendMarkupBps: null,
  aiCreditMarkupBps: null,
  note: "",
  ...over,
});

const input = (over: Partial<MarginInput> = {}): MarginInput => ({
  workspaceId: "w1",
  workspaceName: "Client One",
  currency: "USD",
  platformShare: money(4_900),
  aiCost: money(0),
  aiCreditsUsed: 12,
  aiCreditsReason: null,
  adSpend: money(100_000),
  postsPublished: 20,
  conversationsHandled: 40,
  rate: rate(),
  ...over,
});

describe("addMoney", () => {
  it("adds known parts", () => {
    expect(addMoney([money(100), money(250)]).cents).toBe(350);
  });

  it("refuses to guess when a part is unknown, and keeps the reason once", () => {
    const out = addMoney([money(100), unknownMoney("no source"), unknownMoney("no source")]);
    expect(out.cents).toBeNull();
    expect(out.reason).toBe("no source");
  });
});

describe("withMarkup", () => {
  it("is zero when nothing is rebilled", () => {
    expect(withMarkup(money(1_000), null)).toEqual({ cents: 0, reason: null });
  });

  it("applies basis points", () => {
    expect(withMarkup(money(100_000), 4_500).cents).toBe(145_000);
  });

  it("passes an unknown base straight through", () => {
    expect(withMarkup(unknownMoney("no ad account"), 4_500)).toEqual({ cents: null, reason: "no ad account" });
  });
});

describe("computeMargin", () => {
  it("retainer minus the platform share, with media the client pays for", () => {
    const r = computeMargin(input());
    expect(r.revenue.cents).toBe(250_000);
    expect(r.agencyPaysMedia).toBe(false);
    expect(r.cost.cents).toBe(4_900);
    expect(r.margin.cents).toBe(245_100);
    expect(r.marginPct).toBeCloseTo(0.9804, 4);
  });

  it("rebills ad spend at its markup and counts the media as a cost", () => {
    const r = computeMargin(input({ rate: rate({ adSpendMarkupBps: 5_000 }) }));
    expect(r.agencyPaysMedia).toBe(true);
    expect(r.revenue.cents).toBe(250_000 + 150_000);
    expect(r.cost.cents).toBe(4_900 + 100_000);
    expect(r.margin.cents).toBe(295_100);
  });

  it("rebills AI at its markup without making it media", () => {
    const r = computeMargin(input({ aiCost: money(2_000), rate: rate({ aiCreditMarkupBps: 2_500 }) }));
    expect(r.revenue.cents).toBe(250_000 + 2_500);
    expect(r.cost.cents).toBe(4_900 + 2_000);
    expect(r.agencyPaysMedia).toBe(false);
  });

  it("per-post revenue multiplies the rate by posts actually published", () => {
    const r = computeMargin(input({ rate: rate({ billingModel: "per_post", perPostCents: 7_500 }), postsPublished: 12 }));
    expect(r.revenue.cents).toBe(90_000);
  });

  it("never invents hours", () => {
    const r = computeMargin(input({ rate: rate({ billingModel: "hourly", hourlyCents: 15_000 }) }));
    expect(r.revenue.cents).toBeNull();
    expect(r.revenue.reason).toBe(HOURS_NOT_TRACKED);
    expect(r.margin.cents).toBeNull();
    expect(r.marginPct).toBeNull();
  });

  it("says a per-post client has no per-post rate yet", () => {
    const r = computeMargin(input({ rate: rate({ billingModel: "per_post", perPostCents: null }) }));
    expect(r.revenue.reason).toBe(NO_PER_POST_RATE);
  });

  it("has no revenue without a rate", () => {
    const r = computeMargin(input({ rate: null }));
    expect(r.revenue.reason).toBe(NO_RATE);
    expect(r.billingLabel).toBe("Not set");
    expect(r.cost.cents).toBe(4_900);
  });

  it("all-null inputs stay null and carry every reason", () => {
    const r = computeMargin(
      input({
        rate: null,
        platformShare: unknownMoney("billing not configured"),
        aiCost: unknownMoney("no overage price"),
        aiCreditsUsed: null,
        aiCreditsReason: "usage unknown",
        adSpend: unknownMoney("no ad account"),
      }),
    );
    expect(r.revenue.cents).toBeNull();
    expect(r.cost.cents).toBeNull();
    expect(r.margin.cents).toBeNull();
    expect(r.margin.reason).toContain(NO_RATE);
    expect(r.margin.reason).toContain("billing not configured");
    expect(r.margin.reason).toContain("no overage price");
    expect(r.aiCreditsUsed).toBeNull();
    // Ad spend is unknown but nobody is rebilling it, so it never reaches revenue.
    expect(r.revenue.reason).toBe(NO_RATE);
  });

  it("an unknown ad spend blocks revenue too once a markup rebills it", () => {
    const r = computeMargin(input({ adSpend: unknownMoney("no ad account"), rate: rate({ adSpendMarkupBps: 4_000 }) }));
    expect(r.revenue.cents).toBeNull();
    expect(r.cost.cents).toBeNull();
    expect(r.marginPctReason).toContain("no ad account");
  });

  it("margin % needs revenue to divide by", () => {
    const r = computeMargin(input({ rate: rate({ retainerCents: 0 }), adSpend: money(0) }));
    expect(r.margin.cents).toBe(-4_900);
    expect(r.marginPct).toBeNull();
    expect(r.marginPctReason).toContain("needs revenue");
  });
});

describe("marginTotals", () => {
  const usd = computeMargin(input());
  const usd2 = computeMargin(input({ workspaceId: "w2", workspaceName: "Client Two", rate: rate({ retainerCents: 100_000 }) }));

  it("adds clients that share a currency", () => {
    const t = marginTotals([usd, usd2]);
    expect(t.currency).toBe("USD");
    expect(t.revenue.cents).toBe(350_000);
    expect(t.margin.cents).toBe(340_200);
    expect(t.postsPublished).toBe(40);
  });

  it("refuses to add unlike currencies", () => {
    const eur = computeMargin(input({ workspaceId: "w3", rate: rate({ currency: "EUR" }) }));
    const t = marginTotals([usd, eur]);
    expect(t.currency).toBeNull();
    expect(t.revenue.cents).toBeNull();
    expect(t.revenue.reason).toBe(MIXED_CURRENCY);
  });

  it("one unknown client makes the total unknown rather than smaller", () => {
    const t = marginTotals([usd, computeMargin(input({ workspaceId: "w4", rate: null }))]);
    expect(t.revenue.cents).toBeNull();
    expect(t.margin.cents).toBeNull();
  });

  it("totals nothing for no clients", () => {
    const t = marginTotals([]);
    expect(t.clients).toBe(0);
    expect(t.revenue.cents).toBe(0);
    expect(t.marginPct).toBeNull();
  });
});

describe("formatting", () => {
  it("renders minor units as money", () => {
    expect(formatMoney(250_000, "USD")).toBe("$2,500.00");
  });

  it("keeps a decimal on small percentages only", () => {
    expect(formatPct(0.42)).toBe("42%");
    expect(formatPct(0.035)).toBe("3.5%");
    expect(formatPct(-0.2)).toBe("-20%");
  });
});

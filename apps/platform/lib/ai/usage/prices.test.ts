import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { aiPrices, costUsdFor, priceFor } from "./prices";

const set = (v: string | undefined) => {
  if (v === undefined) delete process.env.AI_PRICES_JSON;
  else process.env.AI_PRICES_JSON = v;
};

beforeEach(() => set(undefined));
afterEach(() => set(undefined));

describe("price configuration", () => {
  test("no configuration means no price and no cost — never a guessed zero", () => {
    expect(aiPrices()).toEqual({});
    expect(priceFor("claude-sonnet-5")).toBeNull();
    expect(costUsdFor("claude-sonnet-5", { inputTokens: 1_000, outputTokens: 1_000 })).toBeNull();
  });

  test("a configured model prices per million tokens, to six decimals", () => {
    set('{"claude-sonnet-5":{"inputPerMTok":3,"outputPerMTok":15}}');
    expect(priceFor("claude-sonnet-5")).toEqual({ inputPerMTok: 3, outputPerMTok: 15 });
    expect(costUsdFor("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(18);
    expect(costUsdFor("claude-sonnet-5", { inputTokens: 1_000, outputTokens: 500 })).toBe(0.0105);
  });

  test("the short `input`/`output` keys are accepted", () => {
    set('{"m":{"input":1,"output":2}}');
    expect(priceFor("m")).toEqual({ inputPerMTok: 1, outputPerMTok: 2 });
  });

  test("an unconfigured model stays unpriced even when others are priced", () => {
    set('{"m":{"input":1,"output":2}}');
    expect(costUsdFor("claude-sonnet-5", { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });

  test("invalid JSON leaves everything unpriced instead of throwing", () => {
    set("{not json");
    expect(aiPrices()).toEqual({});
  });

  test("half-written or non-numeric entries are dropped, not defaulted", () => {
    set('{"a":{"input":1},"b":{"input":"x","output":2},"c":{"input":-1,"output":2},"d":null,"e":{"input":1,"output":2}}');
    expect(Object.keys(aiPrices())).toEqual(["e"]);
  });

  test("changing the configuration is picked up, not cached from the last read", () => {
    set('{"m":{"input":1,"output":1}}');
    expect(priceFor("m")).not.toBeNull();
    set('{"m":{"input":2,"output":2}}');
    expect(priceFor("m")).toEqual({ inputPerMTok: 2, outputPerMTok: 2 });
  });
});

/*
 * Every routable model needs a configured rate.
 *
 * The per-job ceiling refuses ANY model it cannot price — deliberately, since
 * "we don't know what this costs" is the worst possible reason to spend. The
 * consequence is that adding a model without adding its rate produces a
 * feature that looks complete and refuses every request, at the very last step
 * (docs/bugs/B-013).
 *
 * Scoped to the adapters production actually configures — azure and fal. The
 * direct-vendor OpenAI models are in the catalog so old media_job rows still
 * resolve, but nothing routes to them here and pricing them would be inventing
 * a number for a path we do not run. Mocks are exempt for the same reason:
 * they cost nothing and exist to run without config.
 *
 * A model is priced for DOLLARS either by a configured rate or by a verified
 * amountUsd on its descriptor (fal publishes real prices; Azure does not).
 * CREDITS have no such fallback: a tokenless model missing from the credit
 * rates bills the customer nothing at all (docs/bugs/B-004).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRetired, MODELS } from "@rocketease/media";

const KUSTOMIZATION = join(__dirname, "../../../../deploy/k8s/overlays/production/kustomization.yaml");

/** The JSON out of the ConfigMap line, parsed rather than string-matched. */
function rates(key: "AI_MEDIA_RATES_JSON" | "AI_MEDIA_CREDIT_RATES_JSON"): Record<string, number> {
  const yaml = readFileSync(KUSTOMIZATION, "utf8");
  const line = yaml.split("\n").find((l) => l.includes(`${key}=`));
  if (!line) throw new Error(`${key} is not set in the production overlay`);
  return JSON.parse(line.slice(line.indexOf("=") + 1).trim());
}

const routable = MODELS.filter((m) => (m.adapter.startsWith("azure") || m.adapter === "fal") && !isRetired(m));

describe("production media rates", () => {
  it("has models to check, so an empty catalog cannot pass this file", () => {
    expect(routable.length).toBeGreaterThan(2);
  });

  it.each(routable.map((m) => [m.key, m.cost.unit] as const))(
    "%s has a rate, or the ceiling refuses every %s job",
    (key) => {
      const model = routable.find((m) => m.key === key)!;
      const priced = model.cost.verified && model.cost.amountUsd !== null;
      if (!priced) expect(Object.keys(rates("AI_MEDIA_RATES_JSON"))).toContain(key);
    },
  );

  it("prices every model whose vendor reports no tokens, or its credits are null", () => {
    // Tokens drive credits through the normal formula; anything else needs an
    // explicit credits-per-unit or the customer is charged nothing at all.
    const tokenless = routable.filter((m) => m.cost.unit !== "tokens" && !m.cost.tokenRates);
    expect(tokenless.length).toBeGreaterThan(0);
    const credits = Object.keys(rates("AI_MEDIA_CREDIT_RATES_JSON"));
    for (const m of tokenless) expect(credits).toContain(m.key);
  });
});

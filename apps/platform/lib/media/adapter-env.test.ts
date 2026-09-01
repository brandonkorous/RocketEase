/*
 * Every env var an adapter needs must actually reach the container.
 *
 * Secrets get to a pod through exactly one channel: the deploy job copies a
 * NAMED LIST out of Key Vault into platform-env. A name missing from that list
 * is not an error anywhere — the adapter simply reports itself unconfigured,
 * and the product says "the model isn't configured", which is true and
 * useless. It has now happened twice: video (2026-09-01) and speech
 * (docs/bugs/B-012).
 *
 * So this reads what the adapters actually ask for and checks the list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MEDIA_SRC = join(__dirname, "../../../../packages/media/src");
const CI = join(__dirname, "../../../../.github/workflows/ci.yml");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

/** Every process.env.X an adapter reads, deduped. */
function envNamesUsed(): string[] {
  const names = new Set<string>();
  for (const file of walk(MEDIA_SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe("adapter secrets reach the container", () => {
  const ci = readFileSync(CI, "utf8");
  const used = envNamesUsed();

  it("finds the vars the adapters read, so an empty scan cannot pass this file", () => {
    expect(used.length).toBeGreaterThan(5);
    expect(used).toContain("AZURE_OPENAI_ENDPOINT");
  });

  it.each(envNamesUsed().filter((n) => n.startsWith("AZURE_") || n.startsWith("OPENAI_")))(
    "%s is copied from Key Vault by the deploy job",
    (name) => {
      expect(ci).toContain(name);
    },
  );
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absoluteUrl, appUrl } from "./app-url";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });

describe("appUrl", () => {
  it("strips trailing slashes so paths do not double up", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.rocketease.com/";
    expect(appUrl()).toBe("https://app.rocketease.com");
    expect(absoluteUrl("/app/w1/accounts")).toBe("https://app.rocketease.com/app/w1/accounts");
  });
});

/*
 * Behind the shared Caddy proxy the Next server sees its own bind address, so a
 * redirect resolved against `req.url` sends the browser to https://0.0.0.0:3000.
 * Locally the two coincide, so this only ever fails in production — which is why
 * it is asserted here rather than left to review.
 */
describe("redirects", () => {
  it("are never resolved against req.url", () => {
    const offenders = [...walk(join(__dirname, "..", "app")), ...walk(__dirname)]
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => /redirect\(\s*new URL\([^)]*\breq(uest)?\.url\b/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(join(__dirname, ".."), ""));
    expect(offenders).toEqual([]);
  });
});

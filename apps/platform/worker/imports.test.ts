/*
 * The worker must not import `server-only`.
 *
 * That marker throws outside a Next build, so one such import anywhere in the
 * worker's transitive graph kills the process at startup — every queue stops,
 * and the symptom appears somewhere else entirely. It was an e2e inbox failure
 * that exposed it last time: the worker was dead, so channel.sync never ran.
 *
 * Unit tests cannot catch it: they each `vi.mock("server-only")`, which is
 * exactly what hides the problem. So this reads the source instead.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const IMPORT = /^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm;

/** Local .ts/.tsx only — packages and node_modules are not ours to walk. */
function resolveLocal(spec: string, from: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** Every local module the worker can reach, with the path that got us there. */
function reachable(entries: string[]): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: { file: string; chain: string[] }[] = entries.map((f) => ({ file: f, chain: [f] }));
  while (queue.length) {
    const { file, chain } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, chain);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT)) {
      const next = resolveLocal(m[1], file);
      if (next && !seen.has(next)) queue.push({ file: next, chain: [...chain, next] });
    }
  }
  return seen;
}

describe("worker import graph", () => {
  it("never reaches a module that imports server-only", () => {
    const graph = reachable(walk(join(ROOT, "worker")));
    const offenders = [...graph.entries()]
      .filter(([file]) => /^\s*import\s+["']server-only["']/m.test(readFileSync(file, "utf8")))
      .map(([, chain]) => chain.map((f) => f.slice(ROOT.length + 1).split(sep).join("/")).join("\n  -> "));

    expect(offenders, `server-only reachable from the worker:\n\n${offenders.join("\n\n")}`).toEqual([]);
  });

  it("actually walks the graph, rather than passing on an empty one", () => {
    const graph = reachable(walk(join(ROOT, "worker")));
    expect(graph.size).toBeGreaterThan(50);
    expect([...graph.keys()].some((f) => f.includes(join("lib", "media")))).toBe(true);
  });
});

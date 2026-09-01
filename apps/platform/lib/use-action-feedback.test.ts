/*
 * `notify` must keep a stable identity across renders.
 *
 * Three components put it in an effect's dependency list. A fresh function
 * each render makes that effect run on every render, which is harmless until a
 * state carries a message — then the toast re-renders, notify is new, the
 * effect fires again, and the page dies with React #185 (docs/bugs/B-010).
 *
 * There is no jsdom here to render a hook in, so this pins the memoisation at
 * the source, the same way worker/media-poll-schedule.test.ts pins a ticker
 * nothing else can observe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "use-action-feedback.ts"), "utf8");

describe("useActionFeedback", () => {
  it("memoises notify, because callers depend on it inside effects", () => {
    expect(source).toMatch(/const notify = useCallback\(/);
  });

  it("memoises run for the same reason", () => {
    expect(source).toMatch(/const run = useCallback\(/);
  });

  it("reaches the toast through a ref, so a new toast object cannot break the memo", () => {
    // useCallback([toast]) would only be as stable as the provider's object.
    expect(source).toContain("toastRef.current.add");
    expect(source).not.toMatch(/useCallback\([\s\S]*?\}, \[toast\]\)/);
  });
});

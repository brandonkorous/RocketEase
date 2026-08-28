/*
 * Feature flags (integrations.md "Test and operations"): disable one format or
 * mutation without disabling the whole provider. Configured via env for now:
 *   FEATURE_FLAGS=off:tiktok.publish,off:meta.publish.reel,off:linkedin.inbox.reply
 * Keys are dotted paths; the most specific match wins.
 */
const parse = () =>
  new Map(
    (process.env.FEATURE_FLAGS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [state, key] = s.split(":");
        return [key ?? state, (state === "off" ? "off" : "on") as "on" | "off"];
      }),
  );

let cache: Map<string, "on" | "off"> | null = null;

/** e.g. isEnabled("meta.publish.reel") — checks "meta.publish.reel", then "meta.publish", then "meta". */
export function isEnabled(key: string): boolean {
  cache ??= parse();
  const parts = key.split(".");
  for (let i = parts.length; i > 0; i--) {
    const k = parts.slice(0, i).join(".");
    const v = cache.get(k);
    if (v) return v === "on";
  }
  return true;
}

export function disabledReason(key: string): string | null {
  return isEnabled(key) ? null : "Temporarily disabled by Make It Social while the network is having issues.";
}

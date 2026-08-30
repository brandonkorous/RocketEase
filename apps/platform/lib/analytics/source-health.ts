/*
 * Turning a provider's sync error into something a person can act on.
 * `sync_cursor.last_error` holds raw adapter text; nobody should be shown
 * "validation: (#100) The value must be a valid insights metric".
 */
export type SourceExplanation = { headline: string; action: string | null };

/** Already-plain messages we write ourselves; passed through untouched. */
const OURS = /rejected these metric names/i;

export function explainSyncError(lastError: string | null): SourceExplanation {
  if (!lastError) return { headline: "Has not synced recently.", action: "Press Refresh, or check the connection." };
  if (OURS.test(lastError)) return { headline: lastError, action: null };

  const e = lastError.toLowerCase();
  if (e.startsWith("permission")) return { headline: "The connection lost permission.", action: "Reconnect the account." };
  if (e.startsWith("rate_limit")) return { headline: "The network is rate-limiting us.", action: "It will catch up on its own." };
  if (e.includes("valid insights metric") || e.startsWith("validation")) {
    return { headline: "The network rejected part of what we asked for.", action: "Nothing to do — the rest still updates, and we drop names it no longer accepts." };
  }
  if (e.startsWith("temporary") || e.startsWith("network")) return { headline: "The network was unreachable last time.", action: "It will retry on the next sync." };
  return { headline: "The last sync did not finish.", action: "It will retry; reconnect the account if it keeps failing." };
}

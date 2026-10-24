const QUIET_AFTER_MS = 30 * 60_000;
const QUIET_EVERY_MS = 13 * 60_000;

/** A channel with no inbox activity for 30 min is polled about every 15 min; any activity restores the 2-min poll. */
export function inboxPollDue(cursor: { freshAt: Date | null; lastSuccessAt: Date | null } | undefined, now = Date.now()): boolean {
  if (!cursor?.freshAt || !cursor.lastSuccessAt) return true;
  if (now - cursor.freshAt.getTime() < QUIET_AFTER_MS) return true;
  return now - cursor.lastSuccessAt.getTime() >= QUIET_EVERY_MS;
}

/*
 * The consent clock.
 *
 * A rights clock on a stock photo and a consent clock on somebody's VOICE are
 * the same mechanism and deserve the same warning — M8.4's model, extended
 * (docs/media-generation.md §3.4). The difference is what lapsing means: an
 * expired photo licence is a commercial problem, an expired voice consent is a
 * person's likeness being used without permission.
 *
 * So this warns on the same day marks and, unlike the asset sweep, it does NOT
 * require the voice to be in use. A consent expiring quietly is the event.
 */
import { NOTIFY_DAYS } from "@/lib/rights/expiry";
import { day } from "@/lib/rights/format";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { consentDaysLeft } from "./policy";
import { voicesExpiringWithin } from "./store";

/** Look far enough ahead to cover the largest notify mark. */
const HORIZON_DAYS = Math.max(...NOTIFY_DAYS);

export async function sweepExpiringConsent(now = new Date()): Promise<number> {
  const rows = await voicesExpiringWithin(HORIZON_DAYS, now);
  let sent = 0;
  for (const v of rows) {
    const left = consentDaysLeft(v, now);
    if (left === null || !NOTIFY_DAYS.includes(left)) continue;
    await notify({
      workspaceId: v.workspaceId,
      organizationId: v.organizationId,
      userId: null,
      kind: "rights.expiring",
      title: `Consent for “${v.label}” expires in ${left} day${left === 1 ? "" : "s"}`,
      body: `${v.consentPersonName ?? "The person"} gave consent until ${day(v.expiresAt!)}. After that this ${v.kind === "likeness" ? "likeness" : "voice"} can't be used at all — renew it, or stop using it before that date.`,
      href: workspacePath(v.workspaceId, "settings/rights"),
    });
    sent += 1;
  }
  return sent;
}

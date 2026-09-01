import type { JobPayloads } from "@/lib/jobs/queues";
import { sweepExpiringClocks } from "@/lib/rights/expiry";
import { sweepExpiringConsent } from "@/lib/media/voice/expiry";
import type { HandlerContext } from "./index";

/**
 * Nightly: notify before a rights or authorisation clock lapses under a
 * scheduled or promoted post (M8.4), and before a voice or likeness CONSENT
 * lapses (M12.3). Same mechanism, same day marks — but an expired consent is a
 * person's likeness, so it warns whether or not the voice is currently in use.
 */
export async function rightsExpiring(_data: JobPayloads["rights.expiring"], ctx: HandlerContext) {
  const [rights, consent] = await Promise.all([sweepExpiringClocks(), sweepExpiringConsent()]);
  ctx.log.info("rights expiry swept", { notified: rights, consentNotified: consent });
}

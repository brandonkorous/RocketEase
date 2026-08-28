import { db } from "@/db";
import { emit } from "./jobs/outbox";
import { deliverMail, type MailTemplate, renderMail } from "./mail";
import { log } from "./log";

/**
 * Enqueue an email through the outbox (delivered by the worker). Auth flows
 * call this from Better Auth hooks, which are not inside our transactions, so
 * it writes its own outbox row. In dev without a worker running, set
 * MAIL_INLINE=1 to deliver synchronously.
 */
export async function sendMail<T extends MailTemplate>(
  to: string,
  template: T,
  data: Parameters<typeof renderMail<T>>[1],
  meta: { organizationId?: string } = {},
) {
  if (process.env.MAIL_INLINE === "1") {
    await deliverMail({ to, template, data: data as Record<string, unknown> });
    return;
  }
  try {
    await emit(db, "mail.send", { to, template, data: data as Record<string, unknown>, organizationId: meta.organizationId });
  } catch (err) {
    log.error("failed to enqueue mail", { template, err });
    throw err;
  }
}

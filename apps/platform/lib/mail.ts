/*
 * Transactional email (onboarding.md "Lifecycle communication"): verification,
 * reset, invitations, approval requests, publish failures, security events,
 * scheduled reports. Nothing else — no marketing from this path.
 *
 * Templates live in lib/mail/templates/*; this file is transport only.
 * Delivery is SMTP (any provider; Mailpit locally). `sendMail` enqueues via
 * the outbox/worker when a DB tx is available; `deliverMail` does the actual
 * SMTP call and is what the worker runs.
 */
import nodemailer from "nodemailer";
import { log } from "./log";
import { TEMPLATES, type MailTemplate, type Rendered } from "./mail/templates";

export type { MailTemplate };

const FROM = process.env.MAIL_FROM ?? "Make It Social <no-reply@make-it-social.local>";

export function renderMail<T extends MailTemplate>(template: T, data: Parameters<(typeof TEMPLATES)[T]>[0]): Rendered {
  return (TEMPLATES[template] as (d: unknown) => Rendered)(data);
}

let transport: nodemailer.Transporter | null | undefined;
function getTransport() {
  if (transport !== undefined) return transport;
  const url = process.env.SMTP_URL;
  if (!url) {
    transport = null;
    log.warn("SMTP_URL not set — emails are logged, not sent");
    return transport;
  }
  transport = nodemailer.createTransport(url);
  return transport;
}

/** Actual SMTP delivery. Called by the worker; safe to call inline in dev. */
export async function deliverMail(input: { to: string; template: string; data: Record<string, unknown>; replyTo?: string }) {
  if (!(input.template in TEMPLATES)) throw new Error(`Unknown mail template: ${input.template}`);
  const msg = renderMail(input.template as MailTemplate, input.data as never);
  const t = getTransport();
  if (!t) {
    log.info("mail (not sent)", { to: input.to, template: input.template, subject: msg.subject });
    return;
  }
  await t.sendMail({ from: FROM, to: input.to, replyTo: input.replyTo || undefined, subject: msg.subject, html: msg.html, text: msg.text });
}

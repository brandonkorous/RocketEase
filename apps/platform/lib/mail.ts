/*
 * Transactional email (onboarding.md "Lifecycle communication"): verification,
 * reset, invitations, approval requests, publish failures, security events,
 * scheduled reports. Nothing else — no marketing from this path.
 *
 * Delivery is SMTP (any provider; Mailpit locally). `sendMail` enqueues via
 * the outbox/worker when a DB tx is available; `deliverMail` does the actual
 * SMTP call and is what the worker runs.
 */
import nodemailer from "nodemailer";
import { log } from "./log";

export type MailTemplate = keyof typeof TEMPLATES;

const APP_NAME = "Make It Social";
const FROM = process.env.MAIL_FROM ?? "Make It Social <no-reply@make-it-social.local>";

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${label}</a></p>`;

const layout = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a">
<div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:32px">
<p style="font-weight:700;font-size:16px;margin:0 0 20px">${APP_NAME}</p>
<h1 style="font-size:22px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 12px">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:#404040">${body}</div>
<p style="font-size:12px;color:#737373;margin-top:32px">If you didn't expect this email, you can ignore it.</p>
</div></body></html>`;

const TEMPLATES = {
  "auth.verify": (d: { name: string; url: string }) => ({
    subject: `Verify your email for ${APP_NAME}`,
    html: layout("Verify your email", `<p>Hi ${d.name || "there"}, confirm this address to finish setting up your account.</p>${button(d.url, "Verify email")}`),
    text: `Verify your email: ${d.url}`,
  }),
  "auth.reset": (d: { name: string; url: string }) => ({
    subject: `Reset your ${APP_NAME} password`,
    html: layout("Reset your password", `<p>Hi ${d.name || "there"}, use the link below to choose a new password. It expires in one hour.</p>${button(d.url, "Reset password")}`),
    text: `Reset your password: ${d.url}`,
  }),
  "org.invite": (d: { inviterName: string; organizationName: string; workspaceName?: string; role: string; url: string }) => ({
    subject: `${d.inviterName} invited you to ${d.organizationName} on ${APP_NAME}`,
    html: layout(
      `Join ${d.organizationName}`,
      `<p>${d.inviterName} invited you to <strong>${d.organizationName}</strong>${d.workspaceName ? ` — workspace <strong>${d.workspaceName}</strong>` : ""} as <strong>${d.role.replace("_", " ")}</strong>.</p>${button(d.url, "Accept invitation")}<p>This invitation expires in 48 hours.</p>`,
    ),
    text: `${d.inviterName} invited you to ${d.organizationName}. Accept: ${d.url}`,
  }),
  notification: (d: { name: string; title: string; body: string; url: string }) => ({
    subject: d.title,
    html: layout(d.title, `<p>Hi ${d.name || "there"},</p><p>${d.body}</p>${button(d.url, "Open in Make It Social")}`),
    text: `${d.title}\n\n${d.body}\n\n${d.url}`,
  }),
  "security.new_sign_in": (d: { name: string; when: string; ip?: string }) => ({
    subject: `New sign-in to your ${APP_NAME} account`,
    html: layout("New sign-in", `<p>Hi ${d.name}, your account was signed in at ${d.when}${d.ip ? ` from ${d.ip}` : ""}. If this wasn't you, reset your password now.</p>`),
    text: `New sign-in at ${d.when}${d.ip ? ` from ${d.ip}` : ""}.`,
  }),
} as const;

type Rendered = { subject: string; html: string; text: string };

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
export async function deliverMail(input: { to: string; template: string; data: Record<string, unknown> }) {
  if (!(input.template in TEMPLATES)) throw new Error(`Unknown mail template: ${input.template}`);
  const msg = renderMail(input.template as MailTemplate, input.data as never);
  const t = getTransport();
  if (!t) {
    log.info("mail (not sent)", { to: input.to, template: input.template, subject: msg.subject });
    return;
  }
  await t.sendMail({ from: FROM, to: input.to, subject: msg.subject, html: msg.html, text: msg.text });
}

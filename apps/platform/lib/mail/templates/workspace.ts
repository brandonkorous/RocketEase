/* Team and in-product notification mail. */
import { APP_NAME, button, esc, layout } from "./layout";

export const WORKSPACE_TEMPLATES = {
  "org.invite": (d: { inviterName: string; organizationName: string; workspaceName?: string; role: string; url: string }) => ({
    subject: `${d.inviterName} invited you to ${d.organizationName} on ${APP_NAME}`,
    html: layout(
      `Join ${d.organizationName}`,
      `<p>${esc(d.inviterName)} invited you to <strong>${esc(d.organizationName)}</strong>${d.workspaceName ? ` — workspace <strong>${esc(d.workspaceName)}</strong>` : ""} as <strong>${esc(d.role.replace("_", " "))}</strong>.</p>${button(d.url, "Accept invitation")}<p>This invitation expires in 48 hours.</p>`,
    ),
    text: `${d.inviterName} invited you to ${d.organizationName}. Accept: ${d.url}`,
  }),
  notification: (d: { name: string; title: string; body: string; url: string }) => ({
    subject: d.title,
    html: layout(d.title, `<p>Hi ${esc(d.name) || "there"},</p><p>${esc(d.body)}</p>${button(d.url, "Open in RocketEase")}`),
    text: `${d.title}\n\n${d.body}\n\n${d.url}`,
  }),
} as const;

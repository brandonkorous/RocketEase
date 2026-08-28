/* Account lifecycle mail (onboarding.md "Lifecycle communication"). */
import { APP_NAME, button, esc, layout } from "./layout";

export const AUTH_TEMPLATES = {
  "auth.verify": (d: { name: string; url: string }) => ({
    subject: `Verify your email for ${APP_NAME}`,
    html: layout("Verify your email", `<p>Hi ${esc(d.name) || "there"}, confirm this address to finish setting up your account.</p>${button(d.url, "Verify email")}`),
    text: `Verify your email: ${d.url}`,
  }),
  "auth.reset": (d: { name: string; url: string }) => ({
    subject: `Reset your ${APP_NAME} password`,
    html: layout("Reset your password", `<p>Hi ${esc(d.name) || "there"}, use the link below to choose a new password. It expires in one hour.</p>${button(d.url, "Reset password")}`),
    text: `Reset your password: ${d.url}`,
  }),
  "security.new_sign_in": (d: { name: string; when: string; ip?: string }) => ({
    subject: `New sign-in to your ${APP_NAME} account`,
    html: layout("New sign-in", `<p>Hi ${esc(d.name)}, your account was signed in at ${esc(d.when)}${d.ip ? ` from ${esc(d.ip)}` : ""}. If this wasn't you, reset your password now.</p>`),
    text: `New sign-in at ${d.when}${d.ip ? ` from ${d.ip}` : ""}.`,
  }),
} as const;

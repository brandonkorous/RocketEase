/* Every transactional template in one registry; lib/mail.ts renders from it. */
import { AUTH_TEMPLATES } from "./auth";
import { CLIENT_REPORT_TEMPLATES } from "./client-report";
import { WORKSPACE_TEMPLATES } from "./workspace";

export const TEMPLATES = { ...AUTH_TEMPLATES, ...WORKSPACE_TEMPLATES, ...CLIENT_REPORT_TEMPLATES } as const;
export type MailTemplate = keyof typeof TEMPLATES;
export type { Rendered } from "./layout";

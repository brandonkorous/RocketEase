import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { oneTap, organization, twoFactor } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { db, schema } from "@/db";
import { sendMail } from "./mail-queue";
import { blockPasswordWhenSsoEnforced } from "./sso/enforce-hook";

/**
 * Extra column on the SSO provider row: "password sign-in is not allowed for
 * this domain". Registered as a plugin additional field so `pnpm auth:generate`
 * writes it into db/schema/auth.ts. Keep in sync with scripts/auth-schema.config.ts.
 */
export const SSO_PROVIDER_FIELDS = {
  enforced: { type: "boolean", required: false, defaultValue: false, input: true },
} as const;

function socialProviders() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APPLE_CLIENT_ID, APPLE_CLIENT_SECRET, APPLE_APP_BUNDLE_IDENTIFIER } = process.env;
  return {
    ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, prompt: "select_account" as const } } : {}),
    ...(APPLE_CLIENT_ID && APPLE_CLIENT_SECRET ? { apple: { clientId: APPLE_CLIENT_ID, clientSecret: APPLE_CLIENT_SECRET, appBundleIdentifier: APPLE_APP_BUNDLE_IDENTIFIER } } : {}),
  };
}

export const auth = betterAuth({
  appName: "Make It Social",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Sign-up stays unblocked (onboarding.md: never block exploration); the
    // Home checklist nags until verified and publishing requires it (M2).
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(user.email, "auth.reset", { name: user.name, url });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(user.email, "auth.verify", { name: user.name, url });
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Google/Apple sign-in only when credentials exist; the buttons follow NEXT_PUBLIC_AUTH_SOCIAL.
  socialProviders: socialProviders(),
  // Server-side enforcement: hiding the password field is not authorization.
  hooks: { before: blockPasswordWhenSsoEnforced },
  plugins: [
    // Organization = billing/ownership boundary (docs/originals/data-model.md).
    // Workspace membership and the 8 role presets live in our own tables.
    organization({
      creatorRole: "owner",
      organizationLimit: 25,
      invitationExpiresIn: 60 * 60 * 48,
    }),
    twoFactor({ issuer: "Make It Social" }),
    // Google One Tap (auto sign-in prompt); shares the Google OAuth client id.
    ...(process.env.GOOGLE_CLIENT_ID ? [oneTap()] : []),
    // Enterprise SSO (OIDC + SAML), configured per organization in
    // Settings → Single sign-on. Providers are org-scoped rows in `sso_provider`.
    sso({ schema: { ssoProvider: { additionalFields: SSO_PROVIDER_FIELDS } } }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;

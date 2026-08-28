import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { db, schema } from "@/db";
import { sendMail } from "./mail-queue";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

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
  plugins: [
    // Organization = billing/ownership boundary (docs/originals/data-model.md).
    // Workspace membership and the 8 role presets live in our own tables.
    organization({
      creatorRole: "owner",
      organizationLimit: 25,
      invitationExpiresIn: 60 * 60 * 48,
    }),
    twoFactor({ issuer: "Make It Social" }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;

// Used only by `pnpm auth:generate` — mirrors lib/auth.ts plugins without a DB connection.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization, twoFactor } from "better-auth/plugins";
import { sso } from "@better-auth/sso";

// Keep in sync with SSO_PROVIDER_FIELDS in lib/auth.ts.
const ssoProviderFields = {
  enforced: { type: "boolean", required: false, defaultValue: false, input: true },
} as const;

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [organization(), twoFactor(), sso({ schema: { ssoProvider: { additionalFields: ssoProviderFields } } })],
});

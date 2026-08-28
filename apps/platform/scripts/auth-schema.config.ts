// Used only by `pnpm auth:generate` — mirrors lib/auth.ts plugins without a DB connection.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization, twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [organization(), twoFactor()],
});

"use client";

import { createAuthClient } from "better-auth/react";
import { oneTapClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    organizationClient(),
    twoFactorClient({ onTwoFactorRedirect: () => window.location.assign("/login/2fa") }),
    ssoClient(),
    ...(GOOGLE_CLIENT_ID ? [oneTapClient({ clientId: GOOGLE_CLIENT_ID, context: "use", promptOptions: { maxAttempts: 2 } })] : []),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;

"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    organizationClient(),
    twoFactorClient({ onTwoFactorRedirect: () => window.location.assign("/login/2fa") }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;

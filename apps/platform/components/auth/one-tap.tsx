"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GOOGLE_CLIENT_ID, authClient } from "@/lib/auth-client";

/** Google One Tap: auto sign-in prompt. Renders nothing; no-op without NEXT_PUBLIC_GOOGLE_CLIENT_ID. */
export function GoogleOneTap({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const client = authClient as unknown as { oneTap?: (o: Record<string, unknown>) => Promise<void> };
    client.oneTap?.({
      context: mode === "signup" ? "signup" : "signin",
      callbackURL: next,
      fetchOptions: { onSuccess: () => { router.replace(next); router.refresh(); } },
      onPromptNotification: () => {}, // dismissed/skipped: the buttons remain
    }).catch(() => {});
  }, [mode, next, router]);
  return null;
}

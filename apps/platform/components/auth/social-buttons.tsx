"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { OrDivider } from "./shell";

/** Social sign-in appears only for providers configured on the server (NEXT_PUBLIC_AUTH_SOCIAL="google,apple"). */
const ENABLED = (process.env.NEXT_PUBLIC_AUTH_SOCIAL ?? "").split(",").map((s) => s.trim()).filter((s): s is "google" | "apple" => s === "google" || s === "apple");

const LABEL = { google: "Google", apple: "Apple" } as const;

function GoogleMark() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6Z" /></svg>;
}

function AppleMark() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-3.9ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4Z" /></svg>;
}

export function SocialButtons({ mode }: { mode: "login" | "signup" }) {
  const [pending, setPending] = useState<string | null>(null);
  if (ENABLED.length === 0) return null;
  const go = async (provider: "google" | "apple") => {
    setPending(provider);
    const res = await authClient.signIn.social({ provider, callbackURL: "/" });
    if (res.error) setPending(null);
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {ENABLED.map((p) => (
          <Button key={p} type="button" variant="outline" color="neutral" loading={pending === p} onClick={() => go(p)}>
            {p === "google" ? <GoogleMark /> : <AppleMark />}
            {mode === "signup" ? "Sign up" : "Continue"} with {LABEL[p]}
          </Button>
        ))}
      </div>
      <OrDivider />
    </>
  );
}

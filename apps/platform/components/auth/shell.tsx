"use client";

import Link from "next/link";
import { Alert, AlertContent } from "@wizeworks/silicaui-react";

export function AuthHeading({ mode }: { mode: "login" | "signup" }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-1.5 text-sm text-secondary">{mode === "signup" ? "Start your free 14-day trial. No credit card required." : "Log in to your Make It Social account."}</p>
    </div>
  );
}

export function AuthSwitch({ mode }: { mode: "login" | "signup" }) {
  return (
    <p className="text-center text-sm text-secondary">
      {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
      <Link href={mode === "signup" ? "/login" : "/signup"} className="font-semibold text-base-content underline-offset-2 hover:underline">{mode === "signup" ? "Log in" : "Sign up"}</Link>
    </p>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-secondary/70" aria-hidden="true"><span className="h-px flex-1 bg-base-300" />or<span className="h-px flex-1 bg-base-300" /></div>
  );
}

export function AuthError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert color="error" role="alert">
      <AlertContent>{error}</AlertContent>
    </Alert>
  );
}

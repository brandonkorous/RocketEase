"use client";

import Link from "next/link";
import { Alert, AlertContent } from "@wizeworks/silicaui-react";

export function AuthHeading({ mode }: { mode: "login" | "signup" }) {
  return (
    <div>
      <h1 className="app-title">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
      <p className="mt-2 text-base text-secondary">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold underline underline-offset-2">Sign in</Link>
          </>
        ) : (
          <>
            New to Make It Social?{" "}
            <Link href="/signup" className="font-semibold underline underline-offset-2">Create an account</Link>
          </>
        )}
      </p>
    </div>
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

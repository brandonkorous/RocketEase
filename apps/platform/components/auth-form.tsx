"use client";

import { LoginForm } from "./auth/login-form";
import { SignupForm } from "./auth/signup-form";
import { GoogleOneTap } from "./auth/one-tap";

export function AuthForm({ mode, note }: { mode: "login" | "signup"; note?: string }) {
  return (
    <>
      <GoogleOneTap mode={mode} />
      {mode === "signup" ? <SignupForm note={note} /> : <LoginForm />}
    </>
  );
}

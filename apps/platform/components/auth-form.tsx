"use client";

import { LoginForm } from "./auth/login-form";
import { SignupForm } from "./auth/signup-form";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return mode === "signup" ? <SignupForm /> : <LoginForm />;
}

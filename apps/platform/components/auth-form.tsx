"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertContent, Button, Fieldset, FieldsetLegend, Input, Label, PasswordInput } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    const res =
      mode === "signup"
        ? await authClient.signUp.email({ name: String(fd.get("name") ?? "").trim(), email, password })
        : await authClient.signIn.email({ email, password });

    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong. Try again.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="app-title">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
        <p className="mt-2 text-base text-secondary">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold underline underline-offset-2">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to Make It Social?{" "}
              <Link href="/signup" className="font-semibold underline underline-offset-2">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>

      {error && (
        <Alert color="error" role="alert">
          <AlertContent>{error}</AlertContent>
        </Alert>
      )}

      <Fieldset className="flex flex-col gap-4">
        <FieldsetLegend className="sr-only">{mode === "signup" ? "Account details" : "Credentials"}</FieldsetLegend>
        {mode === "signup" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && (
              <Link href="/reset-password" className="text-sm font-medium text-secondary underline-offset-2 hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={10}
            required
          />
          {mode === "signup" && <p className="text-sm text-secondary/70">At least 10 characters.</p>}
        </div>
      </Fieldset>

      <Button type="submit" color="primary" size="lg" block loading={pending}>
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}

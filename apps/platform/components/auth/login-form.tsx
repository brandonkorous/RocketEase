"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Fieldset, FieldsetLegend, Input, Label, PasswordInput } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { lookupSso, type SsoLookup } from "@/lib/actions/security/sso";
import { AuthError, AuthHeading } from "./shell";

type Stage = "email" | "password";

/**
 * Email-first sign-in. The address decides the route: a domain with an
 * enforced SSO connection goes straight to the identity provider, an optional
 * one offers both, and everything else falls back to a password.
 */
export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sso, setSso] = useState<SsoLookup>(null);
  const [stage, setStage] = useState<Stage>("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toIdp(providerId: string) {
    setPending(true);
    setError(null);
    // On success the client follows the provider redirect and never returns.
    const res = await authClient.signIn.sso({ providerId, email, callbackURL: next, errorCallbackURL: "/login" });
    if (res.error) {
      setError(res.error.message ?? "Couldn't reach your identity provider.");
      setPending(false);
    }
  }

  async function onEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const found = await lookupSso(email);
    if (found?.enforced) return toIdp(found.providerId);
    setSso(found);
    setStage("password");
    setPending(false);
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await authClient.signIn.email({ email, password });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Something went wrong. Try again.");
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading mode="login" />
      <AuthError error={error} />
      {stage === "email" ? (
        <EmailStep email={email} setEmail={setEmail} pending={pending} onSubmit={onEmail} />
      ) : (
        <PasswordStep
          email={email}
          password={password}
          setPassword={setPassword}
          pending={pending}
          sso={sso}
          onSubmit={onPassword}
          onBack={() => { setStage("email"); setError(null); }}
          onSso={toIdp}
        />
      )}
    </div>
  );
}

type EmailProps = { email: string; setEmail: (v: string) => void; pending: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void };

function EmailStep({ email, setEmail, pending, onSubmit }: EmailProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Fieldset className="flex flex-col gap-4">
        <FieldsetLegend className="sr-only">Email</FieldsetLegend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <p className="text-sm text-secondary/70">We&apos;ll send you to your company&apos;s sign-in if it&apos;s set up.</p>
        </div>
      </Fieldset>
      <Button type="submit" color="primary" size="lg" block loading={pending} disabled={!email.trim()}>Continue</Button>
    </form>
  );
}

type PasswordProps = {
  email: string;
  password: string;
  setPassword: (v: string) => void;
  pending: boolean;
  sso: SsoLookup;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onSso: (providerId: string) => void;
};

function PasswordStep({ email, password, setPassword, pending, sso, onSubmit, onBack, onSso }: PasswordProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2 rounded-field border border-base-300 px-3 py-2">
        <span className="truncate text-sm">{email}</span>
        <Button type="button" size="xs" variant="ghost" color="neutral" onClick={onBack}>Change</Button>
      </div>
      <input type="hidden" name="email" value={email} autoComplete="username" readOnly />
      {sso && (
        <Button type="button" color="neutral" variant="outline" size="lg" block loading={pending} onClick={() => onSso(sso.providerId)}>
          Continue with single sign-on
        </Button>
      )}
      <Fieldset className="flex flex-col gap-4">
        <FieldsetLegend className="sr-only">Password</FieldsetLegend>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/reset-password" className="text-sm font-medium text-secondary underline-offset-2 hover:underline">Forgot password?</Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </div>
      </Fieldset>
      <Button type="submit" color="primary" size="lg" block loading={pending}>Sign in</Button>
    </form>
  );
}

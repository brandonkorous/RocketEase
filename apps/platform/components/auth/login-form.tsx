"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Checkbox, Input, Label, PasswordInput } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { lookupSso } from "@/lib/actions/security/sso";
import { AuthError, AuthHeading, AuthSwitch } from "./shell";
import { SocialButtons } from "./social-buttons";

/**
 * Sign-in card (auth mockup). The address still decides the route: a domain
 * with an enforced SSO connection goes to the identity provider before the
 * password is ever sent; an optional one is offered as an extra button.
 */
export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [ssoProvider, setSsoProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toIdp(providerId: string) {
    setPending(true);
    setError(null);
    const res = await authClient.signIn.sso({ providerId, email, callbackURL: next, errorCallbackURL: "/login" });
    if (res.error) { setError(res.error.message ?? "Couldn't reach your identity provider."); setPending(false); }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const found = await lookupSso(email);
    if (found?.enforced) return toIdp(found.providerId);
    if (found) setSsoProvider(found.providerId);
    const res = await authClient.signIn.email({ email, password, rememberMe: remember });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Something went wrong. Try again.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <AuthHeading mode="login" />
      <SocialButtons mode="login" />
      <AuthError error={error} />
      {ssoProvider && <Button type="button" variant="outline" color="neutral" block loading={pending} onClick={() => toIdp(ssoProvider)}>Continue with single sign-on</Button>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/reset-password" className="text-xs font-medium text-secondary underline-offset-2 hover:underline">Forgot password?</Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me</label>
      <Button type="submit" color="primary" size="lg" block loading={pending} disabled={!email.trim() || !password}>Log in</Button>
      <AuthSwitch mode="login" />
    </form>
  );
}

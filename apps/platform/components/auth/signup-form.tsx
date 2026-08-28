"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Checkbox, Input, Label, PasswordInput } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { AuthError, AuthHeading, AuthSwitch } from "./shell";
import { SocialButtons } from "./social-buttons";

/** Sign-up card (auth mockup): name, work email, password, terms consent, optional product updates. */
export function SignupForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (fd.get("agree") !== "on") return setError("Please agree to the Terms of Service and Privacy Policy to continue.");
    setPending(true);
    const res = await authClient.signUp.email({
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      password: String(fd.get("password") ?? ""),
    });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Something went wrong. Try again.");
    if (fd.get("updates") === "on") window.localStorage?.setItem("mis:product-updates", "1");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <AuthHeading mode="signup" />
      <SocialButtons mode="signup" />
      <AuthError error={error} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" autoComplete="name" placeholder="Alex Johnson" required autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="alex@company.com" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-secondary/70">At least 10 characters.</p>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-start gap-2"><Checkbox className="mt-0.5" name="agree" aria-label="I agree to the Terms of Service and Privacy Policy" /><span>I agree to the <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link> and <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link></span></label>
        <label className="flex items-start gap-2 text-secondary"><Checkbox className="mt-0.5" name="updates" /><span>Send me product updates and tips</span></label>
      </div>
      <Button type="submit" color="primary" size="lg" block loading={pending}>Create account</Button>
      <AuthSwitch mode="signup" />
    </form>
  );
}

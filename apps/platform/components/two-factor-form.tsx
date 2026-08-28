"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertContent, Button, Checkbox, Input, Label } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";

export function TwoFactorForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code")).replace(/\s/g, "");
    const trustDevice = fd.get("trust") === "on";
    const res =
      mode === "totp" ? await authClient.twoFactor.verifyTotp({ code, trustDevice }) : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    setPending(false);
    if (res.error) return setError(mode === "totp" ? "That code didn't match. Try the next one." : "That backup code isn't valid.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div>
        <h1 className="app-title">Enter your code</h1>
        <p className="mt-2 text-base text-secondary">
          {mode === "totp" ? "Open your authenticator app and enter the 6-digit code." : "Enter one of your backup codes. Each works once."}
        </p>
      </div>
      {error && (
        <Alert color="error" role="alert">
          <AlertContent>{error}</AlertContent>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{mode === "totp" ? "Authenticator code" : "Backup code"}</Label>
        <Input id="code" name="code" inputMode={mode === "totp" ? "numeric" : "text"} autoComplete="one-time-code" required autoFocus className="tracking-widest" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="trust" /> Trust this device for 30 days
      </label>
      <Button type="submit" color="primary" size="lg" block loading={pending}>
        Continue
      </Button>
      <button type="button" className="text-sm font-medium underline-offset-2 hover:underline" onClick={() => setMode(mode === "totp" ? "backup" : "totp")}>
        {mode === "totp" ? "Use a backup code instead" : "Use my authenticator app"}
      </button>
    </form>
  );
}

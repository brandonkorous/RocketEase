"use client";

import { Input, Label, PasswordInput } from "@wizeworks/silicaui-react";
import type { StepUpChallenge } from "@/lib/step-up";

/**
 * NFR-001 re-authentication prompt shown inline before a high-risk confirmation.
 * The value is sent straight to `verifyStepUp` and never stored anywhere else.
 */
export function StepUpField({ challenge, value, onChange, what }: { challenge: StepUpChallenge; value: string; onChange: (v: string) => void; what: string }) {
  const totp = challenge.method === "totp";
  return (
    <div className="mt-4 rounded-field border border-base-300 bg-base-200 p-3">
      <Label htmlFor="step-up-secret" className="text-sm font-semibold">{totp ? "Enter your authentication code" : "Confirm your password"}</Label>
      <p className="mt-1 text-xs text-secondary">{what} requires re-entering your {totp ? "6-digit code" : "password"}. It stays valid for {challenge.windowMinutes} minutes.</p>
      {totp ? (
        <Input id="step-up-secret" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 max-w-40 tracking-widest" required autoFocus />
      ) : (
        <PasswordInput id="step-up-secret" name="password" autoComplete="current-password" value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 max-w-70" required autoFocus />
      )}
    </div>
  );
}

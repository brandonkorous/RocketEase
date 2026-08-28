"use client";

import { useState, type FormEvent } from "react";
import { Button, Label, PasswordInput } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { useActionFeedback } from "@/lib/use-action-feedback";

export function ChangePassword() {
  const { notify } = useActionFeedback();
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    const res = await authClient.changePassword({ currentPassword: String(fd.get("current")), newPassword: String(fd.get("next")), revokeOtherSessions: true });
    setPending(false);
    notify(res.error ? { error: res.error.message ?? "Could not change password" } : { ok: "Password changed. Other sessions were signed out." });
    if (!res.error) form.reset();
  }
  return (
    <section aria-labelledby="pw-heading" className="rounded-box border border-base-300 p-6">
      <h3 id="pw-heading" className="text-base font-semibold">Password</h3>
      <form onSubmit={onSubmit} className="mt-4 grid max-w-130 gap-4">
        <div className="flex flex-col gap-1.5"><Label htmlFor="current">Current password</Label><PasswordInput id="current" name="current" autoComplete="current-password" required /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="next">New password</Label><PasswordInput id="next" name="next" autoComplete="new-password" minLength={10} required /></div>
        <div><Button type="submit" color="primary" loading={pending}>Change password</Button></div>
      </form>
    </section>
  );
}

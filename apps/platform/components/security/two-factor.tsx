"use client";

import { useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Badge, Button, Input, Label, PasswordInput } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Step = "idle" | "password" | "verify" | "codes";

export function TwoFactor({ enabled }: { enabled: boolean }) {
  const { notify, router } = useActionFeedback();
  const [step, setStep] = useState<Step>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const password = (e: FormEvent<HTMLFormElement>) => String(new FormData(e.currentTarget).get("password"));

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const res = await authClient.twoFactor.enable({ password: password(e) });
    setPending(false);
    if (res.error || !res.data || res.data.method !== "totp") return notify({ error: res.error?.message ?? "Could not start setup" });
    setSecret(new URL(res.data.totpURI).searchParams.get("secret"));
    setCodes(res.data.backupCodes);
    setQr(await QRCode.toDataURL(res.data.totpURI, { margin: 1, width: 200, color: { dark: "#0a0a0a", light: "#ffffff" } }));
    setStep("verify");
  }
  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    setPending(true);
    const res = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (res.error) return notify({ error: "That code didn't match. Check your authenticator app's time and try again." });
    notify({ ok: "Two-factor authentication is on." });
    setStep("codes");
  }
  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const res = await authClient.twoFactor.disable({ password: password(e) });
    setPending(false);
    if (res.error) return notify({ error: res.error.message ?? "Could not turn off two-factor" });
    notify({ ok: "Two-factor authentication is off." });
    setStep("idle");
    router.refresh();
  }

  return (
    <section aria-labelledby="mfa-heading" className="rounded-box border border-base-300 p-6">
      <div className="flex items-center justify-between"><h3 id="mfa-heading" className="text-base font-semibold">Two-factor authentication</h3><Badge variant="soft" color={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</Badge></div>
      <p className="mt-2 max-w-140 text-sm leading-relaxed text-secondary">Adds a one-time code from an authenticator app at sign-in. Required for high-risk actions like ownership transfer and spend changes.</p>
      <div className="mt-4 grid max-w-130 gap-4">
        {step === "idle" && <div><Button color={enabled ? "neutral" : "primary"} variant={enabled ? "outline" : "solid"} onClick={() => setStep("password")}>{enabled ? "Turn off two-factor" : "Turn on two-factor"}</Button></div>}
        {step === "password" && <PasswordStep enabled={enabled} pending={pending} onSubmit={enabled ? disable : start} onCancel={() => setStep("idle")} />}
        {step === "verify" && qr && <VerifyStep qr={qr} secret={secret} pending={pending} onSubmit={verify} />}
        {step === "codes" && <BackupCodes codes={codes} onDone={() => { setStep("idle"); router.refresh(); }} />}
      </div>
    </section>
  );
}

function PasswordStep({ enabled, pending, onSubmit, onCancel }: { enabled: boolean; pending: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="flex flex-col gap-1.5"><Label htmlFor="mfa-pw">{enabled ? "Confirm your password to turn it off" : "Confirm your password"}</Label><PasswordInput id="mfa-pw" name="password" autoComplete="current-password" required autoFocus /></div>
      <div className="flex gap-2"><Button type="submit" color={enabled ? "error" : "primary"} variant={enabled ? "outline" : "solid"} loading={pending}>{enabled ? "Turn off" : "Continue"}</Button><Button type="button" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

function VerifyStep({ qr, secret, pending, onSubmit }: { qr: string; secret: string | null; pending: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code for your authenticator app" width={160} height={160} className="rounded-lg border border-base-300" />
        <div className="text-sm leading-relaxed text-secondary"><p>Scan with your authenticator app, then enter the 6-digit code.</p>{secret && <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">Can&apos;t scan? Show the key</summary><code className="mt-1 block break-all text-xs">{secret}</code></details>}</div>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="mfa-code">Code</Label><Input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className="max-w-40 tracking-widest" /></div>
      <div><Button type="submit" color="primary" loading={pending}>Verify and turn on</Button></div>
    </form>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200 p-4">
      <p className="text-sm font-semibold">Backup codes</p>
      <p className="mt-1 text-sm text-secondary">Each works once if you lose your device. Store them somewhere safe; they won&apos;t be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => (<li key={c}>{c}</li>))}</ul>
      <Button className="mt-4" variant="outline" color="neutral" size="sm" onClick={onDone}>I&apos;ve saved these</Button>
    </div>
  );
}

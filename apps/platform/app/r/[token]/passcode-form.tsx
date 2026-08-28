"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import { unlockShare } from "./actions";

/** Second factor for a shared report. No account, no workspace context — just the passcode the agency set. */
export function PasscodeForm({ token }: { token: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await unlockShare(token, passcode);
    setPending(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 flex max-w-90 flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-secondary">Passcode</span>
        <input type="password" className="input input-sm" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus required aria-describedby={error ? "passcode-error" : undefined} />
      </label>
      {error && (
        <p id="passcode-error" className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" color="primary" size="sm" loading={pending} className="self-start">
        Open report
      </Button>
    </form>
  );
}

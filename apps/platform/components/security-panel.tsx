"use client";

import { ChangePassword } from "./security/change-password";
import { Sessions, type SessionRow } from "./security/sessions";
import { TwoFactor } from "./security/two-factor";

export type { SessionRow };

export function SecurityPanel({ twoFactorEnabled, sessions }: { twoFactorEnabled: boolean; sessions: SessionRow[] }) {
  return (
    <div className="mt-4 flex flex-col gap-6">
      <TwoFactor enabled={twoFactorEnabled} />
      <ChangePassword />
      <Sessions sessions={sessions} />
    </div>
  );
}

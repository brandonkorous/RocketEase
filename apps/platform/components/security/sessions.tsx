"use client";

import { Badge, Button, Table } from "@wizeworks/silicaui-react";
import { authClient } from "@/lib/auth-client";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type SessionRow = { token: string; createdAt: string; updatedAt: string; ipAddress?: string | null; userAgent?: string | null; current: boolean };

function describe(ua?: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export function Sessions({ sessions }: { sessions: SessionRow[] }) {
  const { run, pending } = useActionFeedback();
  const revokeOthers = () => run(async () => { const r = await authClient.revokeOtherSessions(); return r.error ? { error: r.error.message ?? "Failed" } : { ok: "Other sessions signed out." }; });
  const revoke = (token: string) => run(async () => { const r = await authClient.revokeSession({ token }); return r.error ? { error: r.error.message ?? "Failed" } : { ok: "Session signed out." }; });
  return (
    <section aria-labelledby="sessions-heading" className="rounded-box border border-base-300 p-6">
      <div className="flex items-center justify-between gap-3"><h3 id="sessions-heading" className="text-base font-semibold">Sessions</h3><Button size="sm" variant="outline" color="neutral" disabled={pending || sessions.length < 2} onClick={revokeOthers}>Sign out other sessions</Button></div>
      <Table className="mt-3 w-full">
        <thead><tr><th>Device</th><th>IP</th><th>Last active</th><th className="text-right">Action</th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.token}>
              <td>{describe(s.userAgent)} {s.current && <Badge size="xs" variant="soft" color="neutral">This device</Badge>}</td>
              <td className="text-sm text-secondary/70">{s.ipAddress || "—"}</td>
              <td className="text-sm text-secondary/70">{new Date(s.updatedAt).toLocaleString()}</td>
              <td className="text-right">{!s.current && <Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={() => revoke(s.token)}>Sign out</Button>}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

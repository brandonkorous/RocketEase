import { Badge } from "@wizeworks/silicaui-react";
import type { AuditEvent } from "@/db/schema/app";
import { formatInZone } from "@/lib/time";

export type VersionRow = { id: string; number: number; reason: string; createdAt: Date; by: string | null };
export type ActivityRow = { a: Pick<AuditEvent, "id" | "action" | "summary" | "createdAt">; by: string | null };

export function Versions({ versions, currentVersionId, tz }: { versions: VersionRow[]; currentVersionId: string | null; tz: string }) {
  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="versions-h">
      <h2 id="versions-h" className="text-base font-semibold">Versions</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between">
            <span>v{v.number} <span className="text-secondary/70">· {v.reason}</span>{currentVersionId === v.id && <Badge size="xs" variant="soft" color="neutral" className="ml-2">current</Badge>}</span>
            <span className="text-xs text-secondary/70">{formatInZone(v.createdAt, tz)}{v.by ? ` · ${v.by}` : ""}</span>
          </li>
        ))}
        {versions.length === 0 && <li className="text-secondary/70">Versions are created when you schedule or request approval.</li>}
      </ul>
    </section>
  );
}

export function Activity({ activity, tz }: { activity: ActivityRow[]; tz: string }) {
  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="activity-h">
      <h2 id="activity-h" className="text-base font-semibold">Activity</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {activity.map(({ a, by }) => (
          <li key={a.id} className="flex items-start justify-between gap-3">
            <span><span className="font-medium">{a.action.replace(/[._]/g, " ")}</span>{a.summary?.note ? <span className="block text-xs text-secondary">{a.summary.note}</span> : null}</span>
            <span className="shrink-0 text-xs text-secondary/70">{formatInZone(a.createdAt, tz, { dateStyle: "short", timeStyle: "short" })}{by ? ` · ${by}` : ""}</span>
          </li>
        ))}
        {activity.length === 0 && <li className="text-secondary/70">No activity yet.</li>}
      </ul>
    </section>
  );
}

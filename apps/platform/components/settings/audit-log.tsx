"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuditLogData } from "@/lib/audit/queries";
import { workspacePath } from "@/lib/nav";

type Props = { data: AuditLogData; timezone: string };

const stamp = (d: Date, tz: string) =>
  d.toLocaleString("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "membership.role_change" reads as "Membership · role change". */
const label = (action: string) => {
  const [group, ...rest] = action.split(".");
  const verb = rest.join(".").replace(/_/g, " ");
  return { group: group ?? action, verb: verb || null };
};

export function AuditLog({ data, timezone }: Props) {
  const router = useRouter();
  const base = workspacePath(data.workspaceId, "settings/audit");
  const q = (patch: Partial<AuditLogData["filters"]> & { cursor?: string | null }) => {
    const next = new URLSearchParams();
    const f = { ...data.filters, ...patch };
    for (const [k, v] of Object.entries(f)) if (v) next.set(k, String(v));
    if (patch.cursor) next.set("cursor", patch.cursor);
    return `${base}?${next.toString()}`;
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="max-w-140 text-sm text-secondary">
        Every recorded action in this workspace, newest first. Rows are append-only — nothing here can be edited or deleted, including by an owner.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Action">
          <select className="select select-sm w-auto" value={data.filters.action} onChange={(e) => router.push(q({ action: e.target.value, cursor: null }))} aria-label="Filter by action">
            <option value="">All actions</option>
            {data.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Person">
          <select className="select select-sm w-auto" value={data.filters.actor} onChange={(e) => router.push(q({ actor: e.target.value, cursor: null }))} aria-label="Filter by person">
            <option value="">Anyone</option>
            {data.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" className="input input-sm w-auto" value={data.filters.from} onChange={(e) => router.push(q({ from: e.target.value, cursor: null }))} aria-label="From date" />
        </Field>
        <Field label="To">
          <input type="date" className="input input-sm w-auto" value={data.filters.to} onChange={(e) => router.push(q({ to: e.target.value, cursor: null }))} aria-label="To date" />
        </Field>
        {(data.filters.action || data.filters.actor || data.filters.from || data.filters.to) && (
          <Link href={base} className="btn btn-sm btn-ghost">
            Clear
          </Link>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="text-xs text-secondary/70">{data.total.toLocaleString()} event{data.total === 1 ? "" : "s"}</span>
          {data.canExport && (
            <Link href={`${workspacePath(data.workspaceId, "audit/export")}?${new URLSearchParams(Object.entries(data.filters).filter(([, v]) => v)).toString()}`} className="btn btn-sm btn-primary">
              Export CSV
            </Link>
          )}
        </span>
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-box border border-base-300 px-4 py-10 text-center text-sm text-secondary/70">
          {data.total === 0 && !data.filters.action && !data.filters.actor ? "Nothing has been recorded in this workspace yet." : "No events match these filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="w-full text-sm">
            <thead className="text-xs text-secondary">
              <tr className="border-b border-base-300">
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Person</th>
                <th className="px-3 py-2 text-left font-medium">Target</th>
                <th className="px-3 py-2 text-left font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {data.rows.map((r) => {
                const a = label(r.action);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-secondary">{stamp(r.createdAt, timezone)}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{a.group}</span>
                      {a.verb && <span className="text-secondary"> · {a.verb}</span>}
                      {r.result !== "ok" && <span className="ml-2 text-xs text-error">{r.result}</span>}
                    </td>
                    <td className="px-3 py-2">{r.actorName}</td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {r.targetType ?? "—"}
                      {r.targetId && <span className="block font-mono text-secondary/60">{r.targetId.slice(0, 8)}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">{r.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.nextCursor && (
        <Link href={q({ cursor: data.nextCursor })} className="btn btn-sm btn-outline self-start">
          Show older
        </Link>
      )}
    </div>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-secondary">
      {l}
      {children}
    </label>
  );
}

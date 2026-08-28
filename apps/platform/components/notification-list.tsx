"use client";

import Link from "next/link";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { markAllRead, markNotificationRead } from "@/lib/actions/notifications";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type NotificationRow = { id: string; kind: string; title: string; body: string | null; href: string | null; read: boolean; when: string };

const KIND_COLOR: Record<string, "error" | "warning" | "info" | "neutral"> = { "publish.failed": "error", "approval.requested": "warning", "approval.decided": "info", "security.new_sign_in": "warning" };

export function NotificationList({ workspaceId, items }: { workspaceId: string; items: NotificationRow[] }) {
  const { run, pending } = useActionFeedback();
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-secondary/70">{unread} unread</span>
        <Button size="sm" variant="ghost" color="neutral" disabled={pending || unread === 0} onClick={() => run(async () => { await markAllRead(workspaceId); return { ok: "All notifications marked read." }; })}>Mark all read</Button>
      </div>
      <ul className="mt-3 divide-y divide-base-300 rounded-box border border-base-300">
        {items.map((n) => (
          <li key={n.id} className={n.read ? "" : "bg-base-200/60"}>
            <Link href={n.href ?? "#"} onClick={() => { if (!n.read) void markNotificationRead(n.id); }} className="flex items-start gap-3 px-4 py-3 hover:bg-base-200">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-base-content"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</span><Badge size="xs" variant="soft" color={KIND_COLOR[n.kind] ?? "neutral"}>{n.kind.replace(".", " ")}</Badge></span>
                {n.body && <span className="mt-0.5 block text-sm text-secondary">{n.body}</span>}
              </span>
              <span className="shrink-0 text-xs text-secondary/70">{n.when}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

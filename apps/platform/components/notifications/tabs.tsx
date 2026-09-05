import Link from "next/link";
import type { NotificationsView } from "@/lib/notifications/query";
import { workspacePath } from "@/lib/nav";

/** Filter tabs; every count carries its definition as a tooltip, because a number without one is a guess. */
export function NotificationTabs({ view }: { view: NotificationsView }) {
  return (
    <nav aria-label="Filter notifications" className="flex items-center gap-6 overflow-x-auto border-b border-base-300 px-5">
      {view.tabs.map((t) => {
        const active = t.key === view.tab;
        return (
          <Link
            key={t.key}
            href={`${workspacePath(view.workspaceId, "notifications")}${t.key === "all" ? "" : `?tab=${t.key}`}`}
            aria-current={active ? "page" : undefined}
            title={t.definition}
            className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 text-sm ${active ? "border-base-content font-semibold" : "border-transparent text-secondary hover:text-base-content"}`}
          >
            <span>{t.label}</span>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-secondary">{t.count}</span>
          </Link>
        );
      })}
      <span className="ml-auto hidden shrink-0 text-xs text-secondary md:block">This workspace only</span>
    </nav>
  );
}

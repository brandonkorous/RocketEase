import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { SettingsIcon } from "@rocketease/ui/icons";
import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import type { NotificationsView } from "@/lib/notifications/query";
import { workspacePath } from "@/lib/nav";
import { MarkAllRead } from "./mark-all";
import { NotificationPager } from "./pager";
import { NotificationRow } from "./row";
import { NotificationTabs } from "./tabs";

/** images/notifications.png: header actions, filter tabs, day groups, real pages. */
export function NotificationsScreen({ view }: { view: NotificationsView }) {
  const settings = workspacePath(view.workspaceId, "settings/notifications");
  const active = view.tabs.find((t) => t.key === view.tab);
  return (
    <AppPage>
      <PageHeader
        title="Notifications"
        description="Everything that needs you in this workspace, newest first."
        actions={
          <>
            <Link href={settings} className={buttonClasses({ variant: "outline", color: "neutral" })}><SettingsIcon size={14} />Preferences</Link>
            <MarkAllRead workspaceId={view.workspaceId} unread={view.unread} />
          </>
        }
      />
      {view.totalAll === 0 ? (
        <PageEmpty title="You're all caught up" description="Publish failures, approval requests, comments, and connection problems show up here and deep-link to the exact object. Choose what also reaches your email under Preferences." primary={{ label: "Notification preferences", href: settings }} secondary={{ label: "Back to Home", href: workspacePath(view.workspaceId, "home") }} />
      ) : (
        <section className="mt-5 overflow-hidden rounded-box border border-base-300" aria-label="Notifications">
          <NotificationTabs view={view} />
          {view.groups.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-secondary">Nothing here. {active?.definition}</p>
          ) : (
            <ul className="divide-y divide-base-300">
              {view.groups.map((g) => (
                <li key={g.bucket}>
                  <div className="flex items-center gap-2 border-b border-base-300 bg-base-200 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-secondary">
                    <span>{g.bucket}</span><span className="font-medium normal-case tracking-normal">· {g.rows.length}</span>
                  </div>
                  <ul className="divide-y divide-base-300">{g.rows.map((r) => <NotificationRow key={r.id} row={r} />)}</ul>
                </li>
              ))}
            </ul>
          )}
          <NotificationPager workspaceId={view.workspaceId} tab={view.tab} paging={view.paging} />
        </section>
      )}
    </AppPage>
  );
}

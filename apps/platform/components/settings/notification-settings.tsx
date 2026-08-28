"use client";

import { Switch } from "@wizeworks/silicaui-react";
import { NOTIFICATION_KINDS, emailWanted } from "@/lib/actions/settings/catalog";
import { setNotificationPreference } from "@/lib/actions/settings/notifications";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; prefs: Record<string, boolean>; email: string };

/** Per-member email opt-in by kind (settings.png "Notification preferences"). In-app notifications are always on. */
export function NotificationSettings({ workspaceId, prefs, email }: Props) {
  const { run, pending } = useActionFeedback();
  return (
    <div className="mt-4 max-w-180">
      <p className="text-sm leading-relaxed text-secondary">Every event below appears in your in-app notifications. Choose which ones also email <span className="font-medium">{email}</span>. These choices are yours and apply to this workspace only.</p>
      <ul className="mt-4 divide-y divide-base-300 rounded-box border border-base-300">
        {NOTIFICATION_KINDS.map((k) => {
          const on = emailWanted(prefs, k.kind, k.email);
          return (
            <li key={k.kind} className="flex items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{k.label}</span><span className="block text-xs text-secondary">{k.desc}</span></span>
              <span className="text-xs text-secondary/70">{on ? "Email on" : "In-app only"}</span>
              <Switch checked={on} disabled={pending} onCheckedChange={(v: boolean) => run(() => setNotificationPreference({ workspaceId, kind: k.kind, email: v }))} aria-label={`Email me about ${k.label.toLowerCase()}`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

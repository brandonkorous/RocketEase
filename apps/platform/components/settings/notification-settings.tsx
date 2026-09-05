"use client";

import { Switch } from "@wizeworks/silicaui-react";
import { PREFS, readPrefs, type PrefKey, type PrefSpec, type StoredPrefs } from "@/lib/notifications/catalog";
import { setNotificationPreference } from "@/lib/actions/settings/notifications";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { KindIcon } from "../notifications/icons";

type Props = { workspaceId: string; prefs: StoredPrefs; email: string };
type Channel = "inApp" | "email";

/** images/notification-preferences.png: one row per event, an In-app and an Email switch; locked channels say "Always". */
export function NotificationSettings({ workspaceId, prefs, email }: Props) {
  const { run, pending } = useActionFeedback();
  const effective = readPrefs(prefs);
  const groups = [...new Set(PREFS.map((p) => p.group))];
  const set = (pref: PrefKey, channel: Channel, on: boolean) => run(() => setNotificationPreference({ workspaceId, pref, channel, on }));

  const cell = (p: PrefSpec, channel: Channel) => {
    const locked = Boolean(p.lock?.[channel]);
    return (
      <div className="flex w-24 shrink-0 flex-col items-center gap-0.5">
        <Switch checked={effective[p.key][channel]} disabled={pending || locked} onCheckedChange={(v: boolean) => set(p.key, channel, v)} aria-label={`${p.label}: ${channel === "inApp" ? "in-app" : "email"}`} />
        {locked && <span className="text-xs text-secondary">Always</span>}
      </div>
    );
  };

  return (
    <div className="mt-4 max-w-220">
      <p className="text-sm leading-relaxed text-secondary">Every event below can reach you in the app, by email, or both. These choices are yours and apply to this workspace only.</p>
      <div className="mt-4 overflow-hidden rounded-box border border-base-300">
        <div className="flex items-center gap-3.5 px-5 py-2.5 text-xs font-semibold text-secondary">
          <span className="w-9 shrink-0" /><span className="flex-1">Event</span><span className="w-24 text-center">In-app</span><span className="w-24 text-center">Email</span>
        </div>
        {groups.map((group) => (
          <div key={group}>
            <div className="border-y border-base-300 bg-base-200 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-secondary">{group}</div>
            <ul className="divide-y divide-base-300">
              {PREFS.filter((p) => p.group === group).map((p) => (
                <li key={p.key} className="flex items-center gap-3.5 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field border border-base-300"><KindIcon icon={p.icon} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{p.label}</span><span className="block text-xs text-secondary">{p.desc}</span></span>
                  {cell(p, "inApp")}
                  {cell(p, "email")}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-secondary">Saved as you go. Email goes to <span className="font-medium">{email}</span>. Digests and quiet hours are not offered yet.</p>
    </div>
  );
}

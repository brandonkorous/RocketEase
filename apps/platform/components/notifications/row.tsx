"use client";

import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { markNotificationRead } from "@/lib/actions/notifications";
import { specFor } from "@/lib/notifications/catalog";
import type { NotificationRowView } from "@/lib/notifications/query";
import { ArrowIcon, KindIcon } from "./icons";

/** One notification. Opening it (title or action) marks it read; a kind that needs action gets a real button. */
export function NotificationRow({ row }: { row: NotificationRowView }) {
  const spec = specFor(row.kind);
  const tone = spec?.chip.tone ?? "neutral";
  const href = row.href ?? "#";
  const open = () => {
    if (!row.read) void markNotificationRead(row.id);
  };
  return (
    <li className={row.read ? "" : "bg-base-200/60"}>
      <div className="grid grid-cols-[16px_36px_1fr] items-start gap-3 px-4 py-3.5 md:grid-cols-[16px_36px_1fr_auto] md:px-5">
        <span className="flex h-9 items-center justify-center">
          <span className={`block h-2 w-2 rounded-full ${row.read ? "bg-transparent" : "bg-base-content"}`} aria-hidden="true" />
          {!row.read && <span className="sr-only">Unread</span>}
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-field border border-base-300 ${tone === "error" ? "text-error" : ""}`}>
          <KindIcon icon={spec?.icon ?? "file"} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} onClick={open} className={`text-sm leading-5 hover:underline ${row.read ? "font-medium" : "font-semibold"}`}>{row.title}</Link>
            {spec && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 ${tone === "error" ? "border-error/40 text-error" : "border-base-300 text-secondary"}`}>
                <KindIcon icon={spec.chip.icon} size={11} strokeWidth={2.2} />{spec.chip.label}
              </span>
            )}
          </div>
          {row.body && <p className="mt-0.5 line-clamp-1 text-sm leading-5 text-secondary">{row.body}</p>}
        </div>
        {/* On phones the time and action sit under the text; from md up they take the right column. */}
        <div className="col-start-3 flex items-center justify-between gap-2 md:col-start-auto md:min-w-36 md:flex-col md:items-end">
          <span className="text-xs leading-4 text-secondary">{row.when}</span>
          {spec?.needsAction ? (
            <Link href={href} onClick={open} className={buttonClasses({ size: "sm", variant: "outline", color: "neutral" })}>{spec.action}</Link>
          ) : (
            <Link href={href} onClick={open} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline">{spec?.action ?? "Open"}<ArrowIcon /></Link>
          )}
        </div>
      </div>
    </li>
  );
}

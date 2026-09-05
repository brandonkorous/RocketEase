import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { pageNumbers, type Paging } from "@/lib/notifications/present";
import type { TabKey } from "@/lib/notifications/catalog";
import { workspacePath } from "@/lib/nav";

const hrefFor = (workspaceId: string, tab: TabKey, page: number) => {
  const q = new URLSearchParams();
  if (tab !== "all") q.set("tab", tab);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return `${workspacePath(workspaceId, "notifications")}${s ? `?${s}` : ""}`;
};

/** Real pages with links, so the browser's back button and a shared URL both land on the same list. */
export function NotificationPager({ workspaceId, tab, paging }: { workspaceId: string; tab: TabKey; paging: Paging }) {
  if (paging.total === 0) return null;
  const ghost = buttonClasses({ size: "sm", variant: "ghost", color: "neutral" });
  const step = (page: number, label: string, glyph: string, enabled: boolean) =>
    enabled ? <Link href={hrefFor(workspaceId, tab, page)} aria-label={label} className={ghost}>{glyph}</Link> : <span aria-disabled="true" className={`${ghost} pointer-events-none opacity-40`}>{glyph}</span>;
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-base-300 bg-base-200 px-5 py-3 md:flex-row">
      <span className="text-xs text-secondary">Showing {paging.from}–{paging.to} of {paging.total}</span>
      {paging.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          {step(paging.page - 1, "Previous page", "‹", paging.page > 1)}
          {pageNumbers(paging.page, paging.pages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-secondary">…</span>
            ) : (
              <Link key={n} href={hrefFor(workspaceId, tab, n)} aria-current={n === paging.page ? "page" : undefined} className={buttonClasses({ size: "sm", variant: n === paging.page ? "outline" : "ghost", color: "neutral" })}>{n}</Link>
            ),
          )}
          {step(paging.page + 1, "Next page", "›", paging.page < paging.pages)}
        </nav>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { explainSyncError } from "@/lib/analytics/source-health";
import { workspacePath } from "@/lib/nav";

export type StaleSource = { name: string; network: string; lastError: string | null };
type Props = { workspaceId: string; stale: StaleSource[] };

/**
 * A degraded source used to be a `title` tooltip on a bare span: unreachable by
 * keyboard, invisible to screen readers, and showing raw provider text. It is a
 * real disclosure now, because "which number is missing and why" is the whole
 * promise of this screen.
 */
export function SourceHealth({ workspaceId, stale }: Props) {
  if (!stale.length) return null;
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none text-warning underline decoration-dotted underline-offset-2 outline-offset-2">
        · {stale.length} source{stale.length > 1 ? "s" : ""} degraded
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-90 rounded-box border border-base-300 bg-base-100 p-4 text-left shadow-lg">
        <p className="text-xs font-semibold text-base-content">Some numbers are not up to date</p>
        <ul className="mt-3 flex flex-col gap-3">
          {stale.map((s) => {
            const { headline, action } = explainSyncError(s.lastError);
            return (
              <li key={`${s.network}-${s.name}`} className="text-xs">
                <p className="font-medium text-base-content">
                  {s.name} <span className="font-normal text-secondary/70">· {s.network}</span>
                </p>
                <p className="mt-0.5 text-secondary">{headline}</p>
                {action && <p className="mt-0.5 text-secondary/70">{action}</p>}
              </li>
            );
          })}
        </ul>
        <Link href={workspacePath(workspaceId, "accounts")} className="mt-3 inline-block text-xs font-medium underline underline-offset-2">
          Open Connected accounts
        </Link>
      </div>
    </details>
  );
}

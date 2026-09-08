"use client";

import Link from "next/link";
import type { ListeningScreenData } from "@/lib/listening/screen";
import { workspacePath } from "@/lib/nav";
import { AdLibrary } from "./ad-library";
import { CoverageGrid } from "./coverage";
import { Feed } from "./feed";
import { QueriesRail } from "./queries";
import { QueryDialog } from "./query-dialog";

/** Listening (M14.11): saved queries, their feed, and what each network allows — with the ad library beside it. */
export function ListeningScreen({ data }: { data: ListeningScreenData }) {
  const base = workspacePath(data.workspaceId, "analytics/listening");
  const seg = (on: boolean) => `rounded-field px-3 py-1.5 text-sm ${on ? "bg-base-content font-semibold text-base-100" : "text-secondary hover:text-base-content"}`;
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <nav className="text-sm text-secondary/70" aria-label="Breadcrumb">
        <Link href={workspacePath(data.workspaceId, "analytics")} className="hover:underline">Analytics</Link> <span className="mx-1">›</span>
        {data.view === "ads" ? (<><Link href={base} className="hover:underline">Listening</Link> <span className="mx-1">›</span> <span className="text-base-content">Ad library</span></>) : <span className="text-base-content">Listening</span>}
      </nav>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="app-title">{data.view === "ads" ? "Ad library" : "Listening"}</h1>
          <p className="mt-1 max-w-200 text-base text-secondary">
            {data.view === "ads"
              ? "Paid creative other businesses are running, read live from the public ad repositories the EU’s Digital Services Act requires. Nothing is stored; every search asks the source again."
              : "Public posts that mention your terms, from the networks that let us search them. Nothing here is a mention of your own accounts — those are in the inbox."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-field border border-base-300 p-0.5" aria-label="View">
            <Link href={base} className={seg(data.view === "listening")} aria-current={data.view === "listening" ? "page" : undefined}>Listening</Link>
            <Link href={`${base}?view=ads`} className={seg(data.view === "ads")} aria-current={data.view === "ads" ? "page" : undefined}>Ad library</Link>
          </nav>
          {data.view === "listening" && data.canEdit && <QueryDialog workspaceId={data.workspaceId} networkState={data.networkState} />}
        </div>
      </div>
      {data.view === "ads" ? (
        <AdLibrary data={data} />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <QueriesRail data={data} />
            <Feed data={data} />
          </div>
          <CoverageGrid title="Coverage — what each network lets us search" rows={data.coverage} />
        </>
      )}
    </div>
  );
}

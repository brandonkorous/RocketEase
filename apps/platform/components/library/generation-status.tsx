"use client";

/*
 * In-flight and recently-failed generations.
 *
 * The toast promises the clip "lands in the library when it's ready", so the
 * library is where the person looks — and before this, a failure meant they
 * looked at an unchanged grid forever (docs/bugs/B-007).
 *
 * The page is a server component, so a job that finishes while it is open
 * changes nothing on screen. This polls ONLY while something is actually
 * running, and stops the moment nothing is.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { chargeNote } from "@/lib/media/generation-copy";
import type { GenerationRow } from "@/lib/media/recent";
import { LibIcon } from "./icons";

/** A clip takes about a minute; an image is inline. Slow enough to be cheap. */
const POLL_MS = 6000;

export function GenerationStatus({ rows }: { rows: GenerationRow[] }) {
  const router = useRouter();
  const working = rows.some((r) => r.state !== "failed");

  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [working, router]);

  if (rows.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold">Generating</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}><Row row={r} /></li>
        ))}
      </ul>
    </section>
  );
}

function Row({ row }: { row: GenerationRow }) {
  const failed = row.state === "failed";
  const noun = row.kind === "video" ? "clip" : row.kind === "audio" ? "voiceover" : "image";
  return (
    <div className={`rounded-box border p-2 ${failed ? "border-error/30 bg-error/5" : "border-base-300"}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <StateIcon failed={failed} />
        {failed ? `This ${noun} failed` : row.state === "queued" ? `Waiting to start your ${noun}` : `Making your ${noun}`}
      </p>
      {row.prompt && <p className="mt-1 line-clamp-2 text-xs text-secondary/70">{row.prompt}</p>}
      {/* The reason, verbatim. A failure with no reason is worse than an ugly one. */}
      {row.error && <p className="mt-1 text-xs text-error">{row.error}</p>}
      {failed && <Charge credits={row.credits} />}
    </div>
  );
}

/** What a failure cost, from the ledger. Never a reassurance we cannot back. */
function Charge({ credits }: { credits: number | null }) {
  return <p className="mt-1 text-xs text-secondary/70">{chargeNote(credits)}</p>;
}

/** Status is icon + label, never colour alone (design.md). */
function StateIcon({ failed }: { failed: boolean }) {
  if (failed) {
    return (
      <svg className="h-3.5 w-3.5 shrink-0 text-error" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" role="img" aria-label="Failed">
        <circle cx="8" cy="8" r="6.25" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="text-secondary/70" aria-label="Working">{LibIcon.clock}</span>;
}

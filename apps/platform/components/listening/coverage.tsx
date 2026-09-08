import type { Coverage } from "@/lib/listening/coverage";

type Row = Coverage & { key: string; state: string | null };

/** Status is a glyph and a label, never colour alone; the words are the network's own (lib/listening/coverage.ts). */
export function CoverageGrid({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="rounded-box border border-base-300 p-4" aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5">
            <dt className="font-semibold"><span aria-hidden="true">{r.covered ? "✓" : "○"}</span> {r.label} <span className="sr-only">{r.covered ? "covered" : "not covered"}</span></dt>
            <dd className="text-secondary">{r.how}{r.state ? <span className="block text-secondary/70">{r.state}</span> : null}{r.doc ? <a href={r.doc} target="_blank" rel="noreferrer" className="ml-1 underline">source ↗</a> : null}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

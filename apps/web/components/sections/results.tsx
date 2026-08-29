/*
 * The metric row stays empty until real, verified numbers exist.
 * Until then this band carries capability proof only — never invented stats.
 */
const PROOF = [
  { label: "Networks at launch", value: "Instagram, Facebook, LinkedIn, TikTok" },
  { label: "Publishing safety", value: "Preview, validation, approval, audit history" },
  { label: "Organic + paid", value: "Compared side by side, promoted in one click" },
  { label: "Built for agencies", value: "Isolated client workspaces, no cross-posting" },
];

export function ResultsBand() {
  return (
    <section data-theme="rke-dark" className="bg-base-100 text-base-content" aria-labelledby="results-heading">
      <div className="page-container py-16 md:py-20">
        <h2 id="results-heading" className="h2-marketing text-center">
          Built for real marketing work
        </h2>
        <dl className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-base-300">
          {PROOF.map((p) => (
            <div key={p.label} className="lg:px-8 lg:first:pl-0 lg:last:pr-0">
              <dt className="text-sm font-semibold text-secondary">{p.label}</dt>
              <dd className="mt-2 text-xl font-bold leading-tight tracking-tight">{p.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

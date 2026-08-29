export type Feature = { title: string; body: string; detail?: string[] };

export function FeatureGrid({ features, columns = 3 }: { features: Feature[]; columns?: 2 | 3 }) {
  const grid = columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <ul className={`grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 ${grid}`}>
      {features.map((f) => (
        <li key={f.title} className="bg-base-100 p-6 lg:p-7">
          <h3 className="text-base font-semibold text-base-content">{f.title}</h3>
          <p className="mt-2.5 text-sm leading-relaxed text-secondary">{f.body}</p>
          {f.detail && (
            <ul className="mt-4 space-y-1.5 border-t border-base-300 pt-4 text-sm text-secondary">
              {f.detail.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden="true" className="text-base-content">
                    &middot;
                  </span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps for lifecycle explanations. */
export function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.title} className="border-t-2 border-base-content pt-5">
          <p className="text-sm font-semibold text-secondary tabular-nums">{String(i + 1).padStart(2, "0")}</p>
          <h3 className="mt-2 text-lg font-semibold text-base-content">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function Section({
  id,
  heading,
  lede,
  tone = "base",
  children,
  labelledBy,
}: {
  id?: string;
  heading?: string;
  lede?: string;
  tone?: "base" | "muted";
  children: React.ReactNode;
  labelledBy?: string;
}) {
  const headingId = labelledBy ?? (id ? `${id}-heading` : undefined);
  return (
    <section
      id={id}
      aria-labelledby={heading ? headingId : undefined}
      className={tone === "muted" ? "border-y border-base-300 bg-base-200" : ""}
    >
      <div className="page-container section-pad">
        {heading && (
          <div className="max-w-3xl">
            <h2 id={headingId} className="h2-marketing">
              {heading}
            </h2>
            {lede && <p className="mt-5 text-lg leading-relaxed text-secondary">{lede}</p>}
          </div>
        )}
        <div className={heading ? "mt-12" : ""}>{children}</div>
      </div>
    </section>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl space-y-5 text-base leading-relaxed text-secondary">{children}</div>;
}

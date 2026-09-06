/** The editor's card, label and hint — the same anatomy as the brand kit forms. */
export function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-box border border-base-300 p-5" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {aside}
      </div>
      <div className="mt-3.5 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export const Label = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => <label htmlFor={htmlFor} className="text-xs font-semibold text-secondary">{children}</label>;

export const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-xs leading-normal text-secondary">{children}</p>;

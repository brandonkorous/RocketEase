import type { ReactNode } from "react";

/** A short, factual token — a tone word, an audience name, a location. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-field border border-base-300 px-2 py-1 text-xs">{children}</span>;
}

export function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li key={t}><Chip>{t}</Chip></li>
      ))}
    </ul>
  );
}

/** Counts under a card's main content: "3 do · 2 don't". Empty parts are dropped. */
export function Meta({ parts }: { parts: (string | null | false)[] }) {
  const kept = parts.filter(Boolean) as string[];
  if (!kept.length) return null;
  return <p className="mt-3 text-xs text-secondary/70">{kept.join(" · ")}</p>;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

import type { CapabilityPath, CatalogEntry } from "@rocketease/providers/client";
import { CAPABILITY_PATHS, extraNotes, reasonFor } from "@rocketease/providers/client";
import { NetMark } from "@/components/net-mark";
import { CAPABILITY_LABELS as LABELS } from "@/lib/capabilities";

/** Free-form reason keys the table has no column for; the adapter still recorded them. */
const NOTE_LABELS: Record<string, string> = {
  publishing: "Publishing",
  quota: "Quota",
  textMaxChars: "Text limit",
  saves: "Saves",
  organic: "Post insights",
};

type Note = { label: string; text: string };

function notesFor(entry: CatalogEntry): Note[] {
  const out: Note[] = [];
  const seen = new Set<string>();
  for (const path of CAPABILITY_PATHS) {
    // A supported capability can still carry a caveat (a tier, a business account); state those too.
    const text = entry.conditional[path] ?? reasonFor(entry.capabilities, path);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ label: LABELS[path] ?? path, text });
  }
  for (const { key, note } of extraNotes(entry.capabilities)) out.push({ label: NOTE_LABELS[key] ?? key, text: note });
  return out;
}

/** The "why" behind every — in the table, stated in full rather than hidden in a tooltip. */
export function CapabilityNotes({ entries }: { entries: CatalogEntry[] }) {
  return (
    <section aria-labelledby="why-heading" className="mt-12">
      <h2 id="why-heading" className="text-lg font-semibold">Why</h2>
      <p className="mt-1 text-sm text-secondary">Every limit above comes from the network&apos;s own API and the access it grants — never from a RocketEase plan.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {entries.map((entry) => {
          const notes = notesFor(entry);
          if (notes.length === 0) return null;
          return (
            <div key={entry.kind} className="rounded-box border border-base-300 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><NetMark network={entry.network} size={18} />{entry.label}</h3>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                {notes.map((n) => (
                  <div key={`${n.label}-${n.text}`} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
                    <dt className="font-medium text-secondary">{n.label}</dt>
                    <dd className="leading-relaxed text-secondary">{n.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

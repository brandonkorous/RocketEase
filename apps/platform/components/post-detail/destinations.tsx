import { Badge } from "@wizeworks/silicaui-react";
import { NetMark } from "@/components/library-screen";
import type { Channel } from "@/db/schema/connections";
import type { ContentItem, PostVariant, PublishJobRow } from "@/db/schema/content";
import { resolveVariant } from "@/lib/content";
import { formatInZone } from "@/lib/time";
import { statusOf } from "./status";

type Row = { v: PostVariant; ch: Channel };

/** Per-channel publication state, including the last error and reconciliation notes. */
export function Destinations({ item, variants, jobs, tz }: { item: ContentItem; variants: Row[]; jobs: PublishJobRow[]; tz: string }) {
  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="dest-h">
      <h2 id="dest-h" className="text-base font-semibold">Destinations</h2>
      <ul className="mt-3 divide-y divide-base-300">
        {variants.map(({ v, ch }) => (<DestinationRow key={v.id} item={item} v={v} ch={ch} job={jobs.find((j) => j.variantId === v.id)} tz={tz} />))}
        {variants.length === 0 && <li className="py-3 text-sm text-secondary/70">No destinations selected yet.</li>}
      </ul>
    </section>
  );
}

function DestinationRow({ item, v, ch, job, tz }: { item: ContentItem; v: PostVariant; ch: Channel; job?: PublishJobRow; tz: string }) {
  const vs = statusOf(v.status);
  const r = resolveVariant(item, v);
  const blocking = v.validation?.issues.filter((i) => i.severity === "error") ?? [];
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <NetMark network={ch.network} size={20} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{ch.name}</span>
          <Badge size="xs" variant="soft" color={vs.color}>{vs.label}</Badge>
          <span className="text-xs text-secondary/70">{v.format}{v.scheduledAt ? ` · ${formatInZone(v.scheduledAt, tz)}` : ""}</span>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-secondary">{r.text || <em>No text</em>}</p>
        {v.remoteUrl && (<a href={v.remoteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-info hover:underline">View on {ch.network === "mock" ? "Demo network" : ch.network} ↗</a>)}
        {v.lastError && (<p className="mt-1 rounded-field bg-error/10 px-3 py-2 text-xs text-error"><strong className="capitalize">{v.lastError.category.replace("_", " ")}:</strong> {v.lastError.message}{v.lastError.ambiguous ? " (result was ambiguous; reconciled before retry)" : ""}</p>)}
        {job?.state === "reconciling" && <p className="mt-1 text-xs text-secondary/70">Confirming with the network…</p>}
        {blocking.length > 0 && v.status === "draft" && <p className="mt-1 text-xs text-error">{blocking[0].message}</p>}
      </div>
      <span className="text-xs text-secondary/70">{v.attempts > 0 ? `${v.attempts} attempt${v.attempts === 1 ? "" : "s"}` : ""}</span>
    </li>
  );
}

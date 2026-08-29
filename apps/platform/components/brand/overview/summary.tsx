import Link from "next/link";
import { Progress } from "@wizeworks/silicaui-react";
import { NetMark } from "@/components/library-screen";
import { OverviewCard, OverviewEmpty } from "@/components/overview-card";
import { NETWORK_LABEL } from "@/components/composer/types";
import type { BrandWarning, Health } from "@/lib/brand/health";
import { brandPath, sectionLabel } from "@/lib/brand/sections";
import type { BrandKit } from "@/lib/brand/types";
import { Meta, plural } from "./chip";

/** One line, not a list: the score, and how many fields are still empty. */
export function Completeness({ health }: { health: Health }) {
  const gaps = health.total - health.done;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-box border border-base-300 px-5 py-3">
      <span className="text-sm font-semibold">{health.percent}% complete</span>
      <Progress value={health.percent} max={100} color="neutral" size="xs" className="w-40" aria-label={`${health.percent}% complete`} />
      <span className="text-sm text-secondary">{gaps ? `${plural(gaps, "part")} of the kit still empty — each card below says what that costs.` : "Every part of the kit has something in it."}</span>
    </div>
  );
}

/** Configured but no longer true: an expired offer, an unlicensed font. */
export function Warnings({ workspaceId, warnings }: { workspaceId: string; warnings: BrandWarning[] }) {
  if (!warnings.length) return null;
  return (
    <section className="mt-4 rounded-box border border-warning/40 bg-warning/10 p-5" aria-labelledby="brand-warn-h">
      <h2 id="brand-warn-h" className="text-base font-semibold text-warning">Out of date ({warnings.length})</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {warnings.map((w, i) => (
          <li key={i}>
            {w.text} <Link href={brandPath(workspaceId, w.section)} className="font-medium underline underline-offset-2">{sectionLabel(w.section)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChannelsCard({ workspaceId, kit }: { workspaceId: string; kit: BrandKit }) {
  const href = brandPath(workspaceId, "channels");
  const filled = kit.channels.filter((c) => c.handle || c.bio || c.linkInBio);
  return (
    <OverviewCard title="Channel presence" href={href} linkLabel="Edit">
      {filled.length === 0 ? (
        <OverviewEmpty title="No profile copy yet" body="Rewriting a bio means logging into every network to find the current one." cta="Add profile copy" href={href} />
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {filled.slice(0, 5).map((c) => (
              <li key={c.network} className="flex items-center gap-2 text-sm">
                <NetMark network={c.network} size={16} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.handle || NETWORK_LABEL[c.network] || c.network}</span>
                <span className="text-xs text-secondary/70">{c.bio ? "bio" : c.linkInBio ? "link" : ""}</span>
              </li>
            ))}
          </ul>
          <Meta parts={[plural(filled.length, "network")]} />
        </div>
      )}
    </OverviewCard>
  );
}

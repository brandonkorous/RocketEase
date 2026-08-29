import { OverviewCard, OverviewEmpty } from "@/components/overview-card";
import { brandPath } from "@/lib/brand/sections";
import { LOGO_LABEL, type Visual } from "@/lib/brand/types";
import type { AssetView, LogoView } from "@/lib/brand/view-types";
import { Meta, plural } from "./chip";

type Base = { workspaceId: string };

const VISUAL = (w: string) => brandPath(w, "visual");

export function LogosCard({ workspaceId, logos }: Base & { logos: LogoView[] }) {
  const shown = logos.slice(0, 4);
  return (
    <OverviewCard title="Logos" href={VISUAL(workspaceId)} linkLabel="Manage">
      {logos.length === 0 ? (
        <OverviewEmpty title="No logo files yet" body="Creative has no mark to place, and client reports fall back to the workspace name." cta="Add logos" href={VISUAL(workspaceId)} />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shown.map((l) => (
              <li key={l.role} className="flex flex-col gap-1">
                <span className={`flex h-16 items-center justify-center rounded-field p-2 ${l.role === "mono_light" ? "bg-neutral" : "bg-base-200"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.url} alt={`${LOGO_LABEL[l.role]} logo`} className="max-h-12 max-w-full" />
                </span>
                <span className="truncate text-xs text-secondary/70">{LOGO_LABEL[l.role]}</span>
              </li>
            ))}
          </ul>
          <Meta parts={[plural(logos.length, "variant"), logos.length > 4 ? `${logos.length - 4} not shown` : null]} />
        </>
      )}
    </OverviewCard>
  );
}

export function PaletteCard({ workspaceId, visual }: Base & { visual: Visual }) {
  const palette = visual.palette;
  return (
    <OverviewCard title="Colour palette" href={VISUAL(workspaceId)} linkLabel="Manage">
      {palette.length === 0 ? (
        <OverviewEmpty title="No palette yet" body="Generated images ignore your colours, and anyone making creative elsewhere has to guess them." cta="Add colours" href={VISUAL(workspaceId)} />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {palette.slice(0, 6).map((s) => (
            <li key={s.hex} className="flex flex-col gap-1">
              <span className="h-12 w-12 rounded-field border border-base-300" style={{ backgroundColor: s.hex }} aria-hidden />
              <span className="text-xs font-medium">{s.name || s.role}</span>
              <span className="font-mono text-xs text-secondary/70">{s.hex}</span>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

export function TypographyCard({ workspaceId, visual }: Base & { visual: Visual }) {
  const t = visual.typography;
  const set = Boolean(t.headingFamily || t.bodyFamily);
  return (
    <OverviewCard title="Typography" href={VISUAL(workspaceId)} linkLabel="Manage">
      {!set ? (
        <OverviewEmpty title="No fonts recorded" body="Freelancers and client decks have nothing to match, so type drifts between pieces." cta="Add typography" href={VISUAL(workspaceId)} />
      ) : (
        <div className="flex flex-col gap-3">
          {t.headingFamily && (
            <div>
              <p className="text-xs text-secondary/70">Headings · {t.headingFamily}</p>
              <p className="mt-1 text-xl font-bold tracking-tight">The quick brown fox</p>
            </div>
          )}
          {t.bodyFamily && (
            <div>
              <p className="text-xs text-secondary/70">Body · {t.bodyFamily}</p>
              <p className="mt-1 text-sm">The quick brown fox jumps over the lazy dog.</p>
            </div>
          )}
          <Meta parts={[t.weights || null, t.licenceNote ? "Licence recorded" : "No licence note"]} />
        </div>
      )}
    </OverviewCard>
  );
}

export function AssetsCard({ workspaceId, assets, links }: Base & { assets: AssetView[]; links: number }) {
  const href = brandPath(workspaceId, "assets");
  return (
    <OverviewCard title="Brand assets" href={href} linkLabel="Manage">
      {assets.length === 0 && links === 0 ? (
        <OverviewEmpty title="No brand assets yet" body="Creators hunt for logos and product shots outside the product instead of starting here." cta="Choose assets" href={href} />
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2">
            {assets.slice(0, 6).map((a) => (
              <li key={a.id} className="flex flex-col gap-1">
                <span className="flex h-16 items-center justify-center overflow-hidden rounded-field bg-base-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.url ? <img src={a.url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-secondary/70">No preview</span>}
                </span>
                <span className="truncate text-xs text-secondary/70">{a.expired ? "Rights expired" : (a.size ?? a.title)}</span>
              </li>
            ))}
          </ul>
          <Meta parts={[assets.length ? plural(assets.length, "asset") : null, links ? plural(links, "external link") : null]} />
        </>
      )}
    </OverviewCard>
  );
}

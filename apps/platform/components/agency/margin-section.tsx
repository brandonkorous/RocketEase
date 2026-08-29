import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { agencyPeriod, canSeeEconomics, marginReport, type Client } from "@/lib/agency/margin-queries";
import { DEFINITIONS } from "@/lib/agency/margin-csv";
import { MarginTable } from "./margin-table";

type Props = { organizationId: string; userId: string; clients: Client[]; timezone: string; period: string | undefined };

const PERIODS: { key: string; label: string }[] = [
  { key: "this", label: "This month" },
  { key: "last", label: "Last month" },
];

/**
 * Per-client cost and margin (M8.11). Commercial data, so owners and admins of
 * the organization only — nobody else learns what the agency charges.
 */
export async function EconomicsSection({ organizationId, userId, clients, timezone, period }: Props) {
  if (!(await canSeeEconomics(organizationId, userId))) return null;
  const window = agencyPeriod(period, timezone);
  const report = await marginReport({ organizationId, clients, period: window, timezone });

  return (
    <section className="mt-10 rounded-box border border-base-300 p-5" aria-labelledby={`econ-${organizationId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`econ-${organizationId}`} className="text-sm font-semibold">Economics</h2>
          <p className="mt-1 max-w-160 text-sm text-secondary">
            What each client costs you and what you bill them, for {window.label}. Rates are yours to set — nothing here is estimated, and an input we don&rsquo;t have shows as &ldquo;—&rdquo; with the reason, never as zero.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-field border border-base-300 p-0.5" aria-label="Period">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/agency?period=${p.key}`}
                aria-current={window.key === p.key ? "page" : undefined}
                className={`rounded-field px-2.5 py-1 text-xs font-medium ${window.key === p.key ? "bg-base-200" : "text-secondary hover:text-base-content"}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <a href={`/agency/margin/export?org=${organizationId}&period=${window.key}`} className={buttonClasses({ color: "neutral", variant: "outline", size: "sm" })}>
            Export CSV
          </a>
        </div>
      </div>

      <MarginTable organizationId={organizationId} rows={report.rows} totals={report.totals} rates={report.rates} canEdit />

      <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-base-300 pt-3 text-xs text-secondary/70 sm:grid-cols-2">
        {DEFINITIONS.slice(0, 6).map(([term, meaning]) => (
          <div key={term} className="flex gap-1.5">
            <dt className="shrink-0 font-medium text-secondary">{term}:</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

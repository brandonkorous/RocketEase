import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Table } from "@wizeworks/silicaui-react";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";
import { BetaControl } from "@/components/staff/beta-control";
import { StaffList } from "@/components/staff/staff-list";
import { formatCostUsd } from "@/lib/media/cost-format";
import { hasEnvAdmins, requireStaff } from "@/lib/staff";
import { listStaff, listStaffOrganizations } from "@/lib/staff/queries";

export const metadata: Metadata = { title: "Staff" };

/**
 * RocketEase's own operator surface. A non-staff visitor gets a 404 from
 * `requireStaff` — this page never appears in customer navigation, and it never
 * calls a tenant gate, so there is no path from here into customer content.
 */
export default async function StaffPage() {
  const staff = await requireStaff("support");
  const canEdit = staff.role === "admin";
  const [orgs, members] = await Promise.all([listStaffOrganizations(), listStaff()]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-base-300">
        <div className="page-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="RocketEase">
            <Mark size={28} />
            <Wordmark />
          </Link>
          <Badge color="neutral" size="sm">
            Staff · {staff.role}
          </Badge>
        </div>
      </header>

      <main className="page-container py-10">
        <h1 className="app-title">Staff</h1>
        <p className="mt-1 max-w-160 text-base text-secondary">
          Operational metadata and beta enrolment. No customer content is readable from here, and nothing on this page enters a
          workspace. Every action is recorded in the target organization&rsquo;s own audit trail.
        </p>

        <section className="mt-10" aria-labelledby="orgs">
          <h2 id="orgs" className="app-section-title">
            Organizations <span className="text-secondary">({orgs.length})</span>
          </h2>

          {orgs.length === 0 ? (
            <p className="mt-4 text-sm text-secondary">No organizations yet.</p>
          ) : (
            <Table className="mt-4 w-full">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Workspaces</th>
                  <th>Created</th>
                  <th>Media generation</th>
                  <th>Our spend (month)</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="font-medium">{o.name}</div>
                      <div className="font-mono text-xs text-secondary">{o.id}</div>
                    </td>
                    <td>{o.workspaces}</td>
                    <td className="text-secondary">{o.createdAt.toLocaleDateString()}</td>
                    <td>
                      {o.betas
                        .filter((b) => b.feature === "media.generation")
                        .map((b) => (
                          <BetaControl
                            key={b.feature}
                            organizationId={o.id}
                            canEdit={canEdit}
                            cell={{ ...b, expiresAt: b.expiresAt?.toISOString() ?? null }}
                          />
                        ))}
                    </td>
                    {/* Vendor cost, not credits: what the monthly ceiling accrues against. */}
                    <td className="tabular-nums">
                      {o.mediaSpendUsd > 0 ? formatCostUsd(o.mediaSpendUsd) : <span className="text-secondary">&mdash;</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {canEdit ? (
          <section className="mt-12" aria-labelledby="staff-people">
            <h2 id="staff-people" className="app-section-title">
              Operators
            </h2>
            <p className="mt-1 max-w-160 text-sm text-secondary">
              Who can reach this page. <code>admin</code> grants betas and manages operators; <code>support</code> reads only.
            </p>
            <StaffList
              envBootstrap={hasEnvAdmins()}
              members={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

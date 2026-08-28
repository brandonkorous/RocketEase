import { Table } from "@wizeworks/silicaui-react";
import type { SsoSectionData } from "@/lib/sso/queries";
import { ConnectionList } from "./sso/connection-list";
import { ScimPanel } from "./sso/scim-panel";

const ACTION_LABEL: Record<string, string> = {
  "sso.configure": "Connection changed",
  "sso.enforce": "Enforcement changed",
  "scim.token.rotate": "Provisioning token",
  "scim.user.provisioned": "User provisioned",
  "scim.user.deprovisioned": "User deprovisioned",
  "scim.group.updated": "Group membership",
  "auth.sso_required": "Password sign-in blocked",
};

/** Settings → Single sign-on. Organization scope: SSO and SCIM belong to the billing boundary. */
export function SsoSettings({ workspaceId, data }: { workspaceId: string; data: SsoSectionData }) {
  return (
    <div className="mt-4 flex max-w-180 flex-col gap-8">
      <p className="text-sm leading-relaxed text-secondary">
        These settings apply to the whole {data.organizationName} organization, not just this workspace.
      </p>
      <ConnectionList workspaceId={workspaceId} connections={data.connections} canManage={data.canManage} />
      <ScimPanel workspaceId={workspaceId} scim={data.scim} canManage={data.canManage} />
      <section aria-labelledby="sso-audit">
        <h3 id="sso-audit" className="text-base font-semibold">Recent activity</h3>
        {data.activity.length === 0 ? (
          <p className="mt-1 text-sm text-secondary">Nothing yet. Every change here is recorded in the audit log.</p>
        ) : (
          <Table className="mt-3 w-full">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-secondary">{row.at}</td>
                  <td>{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td className="text-secondary">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

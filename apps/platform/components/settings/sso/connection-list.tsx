"use client";

import { useState } from "react";
import { Badge, Button, Switch } from "@wizeworks/silicaui-react";
import { removeSsoProvider, setSsoEnforcement } from "@/lib/actions/security/sso";
import type { SsoMatch } from "@/lib/sso/domains";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConnectionForm } from "./connection-form";

type Props = { workspaceId: string; connections: SsoMatch[]; canManage: boolean };

export function ConnectionList({ workspaceId, connections, canManage }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="sso-conn">
      <div className="flex items-center justify-between gap-2">
        <h3 id="sso-conn" className="text-base font-semibold">Identity provider</h3>
        {canManage && !adding && (
          <Button size="sm" color="neutral" variant="outline" onClick={() => { setAdding(true); setEditing(null); }}>Add connection</Button>
        )}
      </div>
      {connections.length === 0 && !adding && (
        <p className="mt-1 max-w-140 text-sm leading-relaxed text-secondary">
          No identity provider is connected. Add an OpenID Connect or SAML 2.0 connection and everyone with a matching
          email domain can sign in through it.
        </p>
      )}
      {adding && <ConnectionForm workspaceId={workspaceId} connection={null} onDone={() => setAdding(false)} />}
      <ul className="mt-3 flex flex-col gap-3">
        {connections.map((c) => (
          <li key={c.providerId} className="rounded-box border border-base-300 p-3">
            <Row c={c} workspaceId={workspaceId} canManage={canManage} onEdit={() => setEditing(editing === c.providerId ? null : c.providerId)} editing={editing === c.providerId} />
            {editing === c.providerId && <ConnectionForm workspaceId={workspaceId} connection={c} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

type RowProps = { c: SsoMatch; workspaceId: string; canManage: boolean; editing: boolean; onEdit: () => void };

function Row({ c, workspaceId, canManage, editing, onEdit }: RowProps) {
  const { run, pending } = useActionFeedback();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {c.providerId}
          <Badge size="xs" variant="soft" color="neutral">{c.protocol === "saml" ? "SAML 2.0" : "OpenID Connect"}</Badge>
          {c.enforced && <Badge size="xs" variant="soft" color="neutral">Required</Badge>}
        </p>
        <p className="mt-1 truncate text-sm text-secondary">{c.domains.join(", ")}</p>
        <p className="truncate text-xs text-secondary/70">{c.issuer}</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={c.enforced} disabled={!canManage || pending} onCheckedChange={(v: boolean) => run(() => setSsoEnforcement({ workspaceId, providerId: c.providerId, enforced: v }))} />
          <span>Require SSO</span>
        </label>
        {canManage && <Button size="xs" variant="outline" color="neutral" onClick={onEdit}>{editing ? "Close" : "Edit"}</Button>}
        {canManage && <Button size="xs" variant="ghost" color="error" loading={pending} onClick={() => run(() => removeSsoProvider({ workspaceId, providerId: c.providerId }))}>Remove</Button>}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Alert, AlertContent, Button } from "@wizeworks/silicaui-react";
import { revokeApiKey } from "@/lib/actions/settings/api-keys";
import type { ApiKeysData } from "@/lib/api/queries";
import { scopeLabel } from "@/lib/api/scopes";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";
import { CreateKey } from "./api/create-key";

/** Settings → API keys. Keys act inside this workspace only, as the person who made them. */
export function ApiKeys({ workspaceId, data }: { workspaceId: string; data: ApiKeysData }) {
  const { run, pending, toast } = useActionFeedback();
  const [minted, setMinted] = useState<string | null>(null);
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.add({ title: "Key copied.", type: "success" });
  };

  return (
    <div className="mt-4 flex max-w-180 flex-col gap-8">
      <section aria-labelledby="api-h">
        <h3 id="api-h" className="text-base font-semibold">Keys</h3>
        <p className="mt-1 text-sm leading-relaxed text-secondary">
          A key lets an agent or script work in this workspace through <span className="font-mono text-xs">{data.baseUrl}</span> and the
          RocketEase MCP server. The same gates apply as in the app: drafts stay drafts, approvals are decided by people, replies wait to be sent.
          A key can never do more than the person who created it, and loses access the moment their role does.
        </p>

        {minted && (
          <Alert color="warning" className="mt-3">
            <AlertContent>
              <p className="font-semibold">Copy this key now — it isn&apos;t shown again.</p>
              <p className="mt-1 break-all font-mono text-xs">{minted}</p>
              <Button size="xs" variant="outline" color="neutral" className="mt-2" onClick={() => copy(minted)}>Copy key</Button>
            </AlertContent>
          </Alert>
        )}

        <table className="mt-4 w-full text-sm">
          <thead className="text-xs text-secondary">
            <tr><th className="pb-2 text-left font-medium">Name</th><th className="pb-2 text-left font-medium">Key</th><th className="pb-2 text-left font-medium">Scopes</th><th className="pb-2 text-left font-medium">Created</th><th className="pb-2 text-left font-medium">Last used</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-base-300">
            {data.keys.map((k) => (
              <tr key={k.id} className={k.revoked ? "text-secondary/70" : undefined}>
                <td className="py-2 pr-3 font-medium">{k.name}{k.revoked && <span className="ml-2 text-xs font-normal">Revoked</span>}</td>
                <td className="py-2 pr-3 font-mono text-xs">{k.prefix}…</td>
                <td className="py-2 pr-3 text-xs">{k.scopes.map(scopeLabel).join(", ") || "—"}</td>
                <td className="py-2 pr-3 text-xs">{k.createdAt}<span className="block text-secondary/70">by {k.createdBy}</span></td>
                <td className="py-2 pr-3 text-xs">{k.lastUsedAt ?? "Never"}</td>
                <td className="py-2 text-right">
                  {data.canManage && !k.revoked && (
                    <ConfirmDialog
                      trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Revoke</Button>}
                      title={`Revoke "${k.name}"?`}
                      description="Requests using this key start failing immediately. Anything it already created stays, with its audit trail."
                      confirmLabel="Revoke"
                      onConfirm={() => run(() => revokeApiKey({ workspaceId, keyId: k.id }))}
                    />
                  )}
                </td>
              </tr>
            ))}
            {data.keys.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-xs text-secondary/70">No API keys yet.</td></tr>}
          </tbody>
        </table>

        {data.canManage ? <CreateKey workspaceId={workspaceId} offered={data.offered} onMinted={setMinted} /> : <p className="mt-3 text-xs text-secondary/70">Only owners and admins can create or revoke API keys.</p>}
      </section>
    </div>
  );
}

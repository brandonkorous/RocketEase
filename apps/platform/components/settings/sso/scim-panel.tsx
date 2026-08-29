"use client";

import { useState } from "react";
import { Alert, AlertContent, Button } from "@wizeworks/silicaui-react";
import { rotateScimToken, revokeScimToken } from "@/lib/actions/security/scim";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { SsoSectionData } from "@/lib/sso/queries";

type Props = { workspaceId: string; scim: SsoSectionData["scim"]; canManage: boolean };

/**
 * SCIM 2.0 provisioning. The token is shown once, right after it is minted —
 * the server only ever stores its hash, so it cannot be shown again.
 */
export function ScimPanel({ workspaceId, scim, canManage }: Props) {
  const { run, pending, toast } = useActionFeedback();
  const [minted, setMinted] = useState<string | null>(null);

  const rotate = () =>
    run(() => rotateScimToken({ workspaceId }), (r) => setMinted(r.token ?? null));

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.add({ title: `${label} copied.`, type: "success" });
  };

  return (
    <section aria-labelledby="scim-h">
      <h3 id="scim-h" className="text-base font-semibold">Directory provisioning (SCIM 2.0)</h3>
      <p className="mt-1 max-w-140 text-sm leading-relaxed text-secondary">
        Point your identity provider at this base URL with the token below. Users are created and deactivated
        automatically; groups named <code className="font-mono text-xs">rke:&lt;workspace&gt;:&lt;role&gt;</code> set
        workspace roles.
      </p>

      <dl className="mt-3 grid max-w-160 grid-cols-[140px_1fr] items-center gap-y-2 text-sm">
        <dt className="text-secondary/70">Base URL</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs">{scim.baseUrl}</span>
          <Button size="xs" variant="outline" color="neutral" onClick={() => copy(scim.baseUrl, "Base URL")}>Copy</Button>
        </dd>
        <dt className="text-secondary/70">Token</dt>
        <dd>{scim.token ? <span className="font-mono text-xs">{scim.token.prefix}… · created {scim.token.createdAt}</span> : <span className="text-secondary/70">Not issued</span>}</dd>
        <dt className="text-secondary/70">Last used</dt>
        <dd>{scim.token?.lastUsedAt ?? <span className="text-secondary/70">Never</span>}</dd>
        <dt className="text-secondary/70">Provisioned users</dt>
        <dd>{scim.provisionedUsers}</dd>
      </dl>

      {minted && (
        <Alert color="warning" className="mt-3 max-w-160">
          <AlertContent>
            <p className="font-semibold">Copy this token now — it isn&apos;t shown again.</p>
            <p className="mt-1 break-all font-mono text-xs">{minted}</p>
            <Button size="xs" variant="outline" color="neutral" className="mt-2" onClick={() => copy(minted, "Token")}>Copy token</Button>
          </AlertContent>
        </Alert>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" color="neutral" variant="outline" loading={pending} onClick={rotate}>
            {scim.token ? "Rotate token" : "Generate token"}
          </Button>
          {scim.token && (
            <Button size="sm" variant="ghost" color="error" loading={pending} onClick={() => run(() => revokeScimToken({ workspaceId }), () => setMinted(null))}>
              Revoke
            </Button>
          )}
        </div>
      )}
      {!canManage && <p className="mt-2 text-xs text-secondary/70">Only organization owners and admins can manage provisioning.</p>}
    </section>
  );
}

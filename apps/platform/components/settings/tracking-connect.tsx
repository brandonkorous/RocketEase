"use client";

import { useState } from "react";
import { Alert, Button, Input, Label } from "@wizeworks/silicaui-react";
import { createWebhookSource } from "@/lib/actions/settings/tracking-sources";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type NewSecret = { secret: string; endpoint: string };

/** The three ways to connect. GA4 and Shopify hand off to their own consent screens. */
export function ConnectSource({ workspaceId, enabled, onSecret }: { workspaceId: string; enabled: { ga4: boolean; shopify: boolean }; onSecret: (s: NewSecret) => void }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <OAuthCard
        kind="ga4"
        title="Google Analytics 4"
        blurb="Daily sessions, key events, and revenue by UTM, filtered to social sources."
        field={{ name: "propertyId", label: "GA4 property id", placeholder: "401234567", hint: "The number in Admin → Property details." }}
        workspaceId={workspaceId}
        enabled={enabled.ga4}
      />
      <OAuthCard
        kind="shopify"
        title="Shopify"
        blurb="Daily orders and order value, attributed by the UTM values on each order's customer journey."
        field={{ name: "shop", label: "Shop domain", placeholder: "acme.myshopify.com", hint: "Your myshopify.com domain." }}
        workspaceId={workspaceId}
        enabled={enabled.shopify}
      />
      <WebhookCard workspaceId={workspaceId} onSecret={onSecret} />
    </div>
  );
}

const CARD = "flex flex-col gap-2 rounded-box border border-base-300 p-4";

type OAuthProps = { kind: "ga4" | "shopify"; title: string; blurb: string; field: { name: string; label: string; placeholder: string; hint: string }; workspaceId: string; enabled: boolean };

/** A plain GET form: the start route validates, creates the pending row, and redirects to consent. */
function OAuthCard({ kind, title, blurb, field, workspaceId, enabled }: OAuthProps) {
  return (
    <form action={`/api/tracking/${kind}/start`} method="get" className={CARD}>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-xs leading-relaxed text-secondary">{blurb}</p>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Label htmlFor={`${kind}-field`}>{field.label}</Label>
      <Input id={`${kind}-field`} name={field.name} size="sm" placeholder={field.placeholder} required disabled={!enabled} />
      <span className="text-xs text-secondary/70">{enabled ? field.hint : `${title} is not configured in this deployment.`}</span>
      <div className="mt-auto pt-2"><Button type="submit" size="sm" color="primary" disabled={!enabled}>Connect</Button></div>
    </form>
  );
}

function WebhookCard({ workspaceId, onSecret }: { workspaceId: string; onSecret: (s: NewSecret) => void }) {
  const { run, pending } = useActionFeedback();
  const [name, setName] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () => createWebhookSource({ workspaceId, name }),
      (r) => {
        if (r.secret && r.endpoint) onSecret({ secret: r.secret, endpoint: r.endpoint });
        if (r.ok) setName("");
      },
    );
  };
  return (
    <form onSubmit={submit} className={CARD}>
      <h4 className="text-sm font-semibold">Conversion webhook</h4>
      <p className="text-xs leading-relaxed text-secondary">A signed endpoint any pixel or CRM can post conversions to when we have no direct integration.</p>
      <Label htmlFor="webhook-name">Source name</Label>
      <Input id="webhook-name" size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="HubSpot deals" required />
      <span className="text-xs text-secondary/70">Shown next to every number this source reports.</span>
      <div className="mt-auto pt-2"><Button type="submit" size="sm" color="primary" loading={pending} disabled={!name.trim()}>Create endpoint</Button></div>
    </form>
  );
}

/** Blocking, one-time reveal: the secret cannot be read back, so this is an Alert, not a toast. */
export function SecretPanel({ secret, onDismiss }: { secret: NewSecret; onDismiss: () => void }) {
  return (
    <Alert color="warning" variant="soft" className="mt-4">
      <div className="flex flex-col gap-2">
        <span className="font-semibold">Copy this signing secret now — it is not shown again.</span>
        <dl className="grid gap-1 text-sm">
          <dt className="text-secondary">Endpoint</dt>
          <dd className="break-all font-mono text-xs">{secret.endpoint}</dd>
          <dt className="text-secondary">Signing secret</dt>
          <dd className="break-all font-mono text-xs">{secret.secret}</dd>
        </dl>
        <p className="text-xs leading-relaxed">
          Sign each request as <code className="font-mono">sha256=HMAC-SHA256(&quot;{"{timestamp}"}.{"{body}"}&quot;)</code> and send it as <code className="font-mono">x-mis-signature</code> with the unix seconds in <code className="font-mono">x-mis-timestamp</code>. See docs/tracking.md for the payload shape.
        </p>
        <div><Button size="sm" variant="outline" color="neutral" onClick={onDismiss}>Done</Button></div>
      </div>
    </Alert>
  );
}

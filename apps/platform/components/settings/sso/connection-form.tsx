"use client";

import { useState, type FormEvent } from "react";
import { Button, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { saveSsoProvider } from "@/lib/actions/security/sso";
import type { SsoMatch } from "@/lib/sso/domains";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Draft = {
  providerId: string;
  protocol: "oidc" | "saml";
  domain: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  discoveryEndpoint: string;
  entryPoint: string;
  idpEntityId: string;
  cert: string;
};

const blank: Draft = { providerId: "", protocol: "oidc", domain: "", issuer: "", clientId: "", clientSecret: "", discoveryEndpoint: "", entryPoint: "", idpEntityId: "", cert: "" };

const from = (c: SsoMatch | null): Draft =>
  c ? { ...blank, providerId: c.providerId, protocol: c.protocol, domain: c.domains.join(", "), issuer: c.issuer } : blank;

/** Register or edit one connection. Secrets are write-only: nothing is ever read back. */
export function ConnectionForm({ workspaceId, connection, onDone }: { workspaceId: string; connection: SsoMatch | null; onDone: () => void }) {
  const { run, pending } = useActionFeedback();
  const [d, setD] = useState<Draft>(from(connection));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => saveSsoProvider({ workspaceId, ...d }), (r) => { if (!r.error) onDone(); });
  };

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="Connection name" hint="Lowercase, no spaces. Shown in sign-in URLs.">
        <Input size="sm" value={d.providerId} onChange={(e) => set("providerId", e.target.value)} disabled={Boolean(connection)} required />
      </Field>
      <Field label="Protocol">
        <select className="select select-sm" value={d.protocol} onChange={(e) => set("protocol", e.target.value as Draft["protocol"])} disabled={Boolean(connection)}>
          <option value="oidc">OpenID Connect</option>
          <option value="saml">SAML 2.0</option>
        </select>
      </Field>
      <Field label="Email domains" hint="Comma separated for multiple domains.">
        <Input size="sm" value={d.domain} onChange={(e) => set("domain", e.target.value)} placeholder="acme.com, acme.co.uk" required />
      </Field>
      <Field label="Issuer URL" hint="From your identity provider.">
        <Input size="sm" type="url" value={d.issuer} onChange={(e) => set("issuer", e.target.value)} required />
      </Field>
      {d.protocol === "oidc" ? <OidcFields d={d} set={set} editing={Boolean(connection)} /> : <SamlFields d={d} set={set} />}
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" color="primary" loading={pending}>{connection ? "Save connection" : "Connect"}</Button>
        <Button type="button" size="sm" variant="ghost" color="neutral" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-secondary">{label}</Label>
      {children}
      {hint && <p className="text-xs text-secondary/70">{hint}</p>}
    </div>
  );
}

type FieldProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void };

function OidcFields({ d, set, editing }: FieldProps & { editing: boolean }) {
  return (
    <>
      <Field label="Client ID">
        <Input size="sm" value={d.clientId} onChange={(e) => set("clientId", e.target.value)} required />
      </Field>
      <Field label="Client secret" hint={editing ? "Leave blank to keep the stored secret." : undefined}>
        <Input size="sm" type="password" autoComplete="off" value={d.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} required={!editing} />
      </Field>
      <Field label="Discovery endpoint" hint="Optional. Defaults to the issuer's .well-known document.">
        <Input size="sm" type="url" value={d.discoveryEndpoint} onChange={(e) => set("discoveryEndpoint", e.target.value)} />
      </Field>
    </>
  );
}

function SamlFields({ d, set }: FieldProps) {
  return (
    <>
      <Field label="Sign-on URL (entry point)">
        <Input size="sm" type="url" value={d.entryPoint} onChange={(e) => set("entryPoint", e.target.value)} required />
      </Field>
      <Field label="IdP entity ID" hint="Optional. Defaults to the issuer URL.">
        <Input size="sm" value={d.idpEntityId} onChange={(e) => set("idpEntityId", e.target.value)} />
      </Field>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label className="text-xs font-medium text-secondary">Signing certificate (PEM)</Label>
        <Textarea size="sm" className="font-mono" rows={5} value={d.cert} onChange={(e) => set("cert", e.target.value)} required />
      </div>
    </>
  );
}

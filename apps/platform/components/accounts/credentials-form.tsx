"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, AlertContent, Button, Input, Label } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { CredentialsForm } from "@rocketease/providers/client";
import { signInWithCredentials, type CredentialsState } from "@/lib/actions/connect-credentials";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";

export type CredentialsFormProps = {
  workspaceId: string;
  provider: string;
  network: string;
  displayName: string;
  form: CredentialsForm;
  reconnect: string | null;
  next: string | null;
};

/** The sign-in card for a network without OAuth; every field comes from the adapter's own description. */
export function CredentialsConnectForm({ workspaceId, provider, network, displayName, form, reconnect, next }: CredentialsFormProps) {
  const [state, action, pending] = useActionState<CredentialsState, FormData>(signInWithCredentials, {});
  return (
    <form action={action} className="mt-8 max-w-120 rounded-box border border-base-300 p-6">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="provider" value={provider} />
      {reconnect && <input type="hidden" name="reconnect" value={reconnect} />}
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex items-center gap-3">
        <NetMark network={network} size={24} />
        <h2 className="text-base font-semibold">{form.title}</h2>
      </div>
      <p className="mt-2 text-sm text-secondary">{form.intro}</p>
      {state.error && (
        <Alert color="error" role="alert" className="mt-4">
          <AlertContent>{state.error}</AlertContent>
        </Alert>
      )}
      <div className="mt-5 flex flex-col gap-4">
        {form.fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5">
            <Label htmlFor={`cred-${f.name}`} className="text-xs font-medium text-secondary">{f.label}</Label>
            <Input id={`cred-${f.name}`} name={f.name} type={f.type} placeholder={f.placeholder} autoComplete={f.autoComplete} defaultValue={f.type === "password" ? undefined : state.values?.[f.name]} required autoFocus={f === form.fields[0]} />
            {f.help && <p className="text-xs text-secondary">{f.help}</p>}
          </div>
        ))}
      </div>
      {form.help && (
        <p className="mt-4 text-sm">
          <a href={form.help.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{form.help.label}</a>
          <span className="text-secondary"> (opens {displayName})</span>
        </p>
      )}
      <div className="mt-6 flex items-center justify-end gap-2">
        <Link href={workspacePath(workspaceId, "accounts")} className={buttonClasses({ variant: "ghost", color: "neutral" })}>Cancel</Link>
        <Button type="submit" color="primary" loading={pending}>Sign in and continue</Button>
      </div>
    </form>
  );
}

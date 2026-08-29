"use client";

import { useState } from "react";
import { Button, Checkbox, Input, Label } from "@wizeworks/silicaui-react";
import { createApiKey } from "@/lib/actions/settings/api-keys";
import type { ApiKeysData } from "@/lib/api/queries";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; offered: ApiKeysData["offered"]; onMinted: (token: string) => void };

const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

/** Create form: a name and the scopes this member is allowed to hand over. */
export function CreateKey({ workspaceId, offered, onMinted }: Props) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () => createApiKey({ workspaceId, name, scopes }),
      (r) => {
        if (r.error) return;
        onMinted(r.token ?? "");
        setOpen(false);
        setName("");
        setScopes([]);
      },
    );
  };

  if (!offered.length) return <p className="mt-3 text-sm text-secondary">Your role holds none of the capabilities this API exposes, so there is nothing you could delegate to a key.</p>;
  if (!open) return <Button size="sm" color="primary" className="mt-3" onClick={() => setOpen(true)}>New API key</Button>;

  return (
    <form onSubmit={submit} className="mt-3 flex max-w-160 flex-col gap-4 rounded-box border border-base-300 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key-name">Name</Label>
        <Input id="key-name" size="sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Claude Desktop — Ana" required />
        <span className="text-xs text-secondary/70">Name it after the agent or person using it, so you know what you are revoking.</span>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Scopes</legend>
        {offered.map((s) => (
          <label key={s.scope} className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={scopes.includes(s.scope)} onChange={(e) => setScopes(toggle(scopes, s.scope, e.target.checked))} />
            <span>
              <span className="font-medium">{s.label}</span>
              <span className="ml-2 font-mono text-xs text-secondary/70">{s.scope}</span>
              <span className="block text-xs text-secondary">{s.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" color="neutral" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" color="primary" loading={pending} disabled={!name.trim() || !scopes.length}>Create key</Button>
      </div>
    </form>
  );
}

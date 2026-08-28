"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, AlertContent, Button, Input, Label, NativeSelect } from "@wizeworks/silicaui-react";
import { createWorkspace, type CreateWorkspaceState } from "@/lib/actions/workspace";

export function NewWorkspaceForm({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<CreateWorkspaceState, FormData>(createWorkspace, {});
  const [tz, setTz] = useState("UTC");
  useEffect(() => {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (guess) setTz(guess);
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div>
        <h1 className="app-title">New workspace</h1>
        <p className="mt-2 text-base leading-relaxed text-secondary">
          One brand or client. Its channels, content, conversations, and reports stay isolated from other workspaces.
        </p>
      </div>
      {state.error && (
        <Alert color="error" role="alert">
          <AlertContent>{state.error}</AlertContent>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="organizationId">Organization</Label>
        <NativeSelect id="organizationId" name="organizationId" defaultValue={organizations[0]?.id}>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" placeholder="Client or brand name" required autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Scheduling timezone</Label>
        <Input id="timezone" name="timezone" value={tz} onChange={(e) => setTz(e.target.value)} />
      </div>
      <Button type="submit" color="primary" size="lg" loading={pending}>
        Create workspace
      </Button>
    </form>
  );
}

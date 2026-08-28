"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, AlertContent, Button, Checkbox, Input, Label, NativeSelect } from "@wizeworks/silicaui-react";
import { FolderIcon } from "@make-it-social/ui/icons";
import { createOrganizationAndWorkspace, type OnboardingState } from "@/lib/actions/onboarding";
import { INDUSTRIES } from "@/lib/actions/settings/catalog";
import { StepIntro } from "./frame";

const COMMON_TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5"><Label htmlFor={id} className="text-xs font-medium text-secondary">{label}</Label>{children}{error && <p className="text-xs text-error">{error}</p>}</div>
  );
}

/** Step 1 (onboarding mockup): organization + first workspace, type, industry, timezone. */
export function WorkspaceStep() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(createOrganizationAndWorkspace, {});
  const [tz, setTz] = useState("UTC");
  useEffect(() => { const guess = Intl.DateTimeFormat().resolvedOptions().timeZone; if (guess) setTz(guess); }, []);
  const zones = COMMON_TIMEZONES.includes(tz) ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES];
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <StepIntro icon={<FolderIcon />} title="Let's create your workspace" copy="This will be the home for your team, content, and social growth." />
      {state.error && <Alert color="error" role="alert"><AlertContent>{state.error}</AlertContent></Alert>}
      <Field id="organizationName" label="Organization name" error={state.fieldErrors?.organizationName}><Input id="organizationName" name="organizationName" placeholder="BrightFit" required autoFocus /></Field>
      <Field id="workspaceName" label="Workspace name" error={state.fieldErrors?.workspaceName}><Input id="workspaceName" name="workspaceName" placeholder="BrightFit Marketing" required /></Field>
      <Field id="workspaceType" label="Workspace type">
        <NativeSelect id="workspaceType" name="workspaceType" defaultValue="brand"><option value="brand">Brand</option><option value="client">Agency client</option></NativeSelect>
      </Field>
      <Field id="industry" label="Industry">
        <NativeSelect id="industry" name="industry" defaultValue=""><option value="">Choose an industry</option>{INDUSTRIES.map((i) => (<option key={i} value={i}>{i}</option>))}</NativeSelect>
      </Field>
      <Field id="timezone" label="Time zone">
        <NativeSelect id="timezone" name="timezone" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => (<option key={z} value={z}>{z}</option>))}</NativeSelect>
      </Field>
      <label className="flex items-start gap-2 text-sm"><Checkbox name="isAgency" className="mt-0.5" /><span>This is an agency<span className="block text-xs text-secondary">Each client gets an isolated workspace.</span></span></label>
      <Button type="submit" color="primary" size="lg" block loading={pending}>Continue</Button>
    </form>
  );
}

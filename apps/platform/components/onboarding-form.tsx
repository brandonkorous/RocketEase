"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, AlertContent, Button, Checkbox, Input, Label, NativeSelect } from "@wizeworks/silicaui-react";
import { createOrganizationAndWorkspace, type OnboardingState } from "@/lib/actions/onboarding";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function OnboardingForm({ userName }: { userName: string }) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(createOrganizationAndWorkspace, {});
  const [tz, setTz] = useState("UTC");

  useEffect(() => {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (guess) setTz(guess);
  }, []);

  const zones = COMMON_TIMEZONES.includes(tz) ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES];

  return (
    <form action={formAction} className="flex flex-col gap-7">
      <div>
        <h1 className="app-title">Welcome, {userName.split(" ")[0]}.</h1>
        <p className="mt-2 text-base leading-relaxed text-secondary">
          Set up your organization and first workspace. An organization is the billing boundary; a
          workspace is one brand or client. You can add more workspaces later.
        </p>
      </div>

      {state.error && (
        <Alert color="error" role="alert">
          <AlertContent>{state.error}</AlertContent>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="organizationName">Organization name</Label>
        <Input id="organizationName" name="organizationName" placeholder="Acme Agency" required autoFocus />
        {state.fieldErrors?.organizationName && (
          <p className="text-sm text-error">{state.fieldErrors.organizationName}</p>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox name="isAgency" className="mt-0.5" />
        <span>
          <span className="font-medium">This is an agency</span>
          <span className="block text-secondary/70">
            Each client gets an isolated workspace. Nothing is shared across clients unless you choose to.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workspaceName">First workspace (brand or client)</Label>
        <Input id="workspaceName" name="workspaceName" placeholder="Acme Coffee" required />
        {state.fieldErrors?.workspaceName && <p className="text-sm text-error">{state.fieldErrors.workspaceName}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Scheduling timezone</Label>
        <NativeSelect id="timezone" name="timezone" value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </NativeSelect>
        <p className="text-sm text-secondary/70">Posts are scheduled in this timezone. Stored in UTC.</p>
      </div>

      <Button type="submit" color="primary" size="lg" loading={pending}>
        Create workspace
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Badge, Button, Input, Label, NativeSelect } from "@wizeworks/silicaui-react";
import { setStaff } from "@/lib/actions/staff";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type StaffMember = { userId: string; name: string; email: string; role: string; createdAt: string };

/**
 * Stored operators. Addresses in STAFF_EMAILS are a bootstrap, not rows, so they
 * do not appear here — the empty state says so rather than implying nobody has
 * access.
 */
export function StaffList({ members, envBootstrap }: { members: StaffMember[]; envBootstrap: boolean }) {
  const { run, pending } = useActionFeedback();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");

  const add = () => {
    if (!email.trim()) return;
    run(() => setStaff({ email, role }), (r) => {
      if (!r.error) setEmail("");
    });
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-email">Email</Label>
          <Input id="staff-email" size="sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@wize.works" className="w-72" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-role">Role</Label>
          <NativeSelect id="staff-role" size="sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="support">Support</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </div>
        <Button color="primary" disabled={pending || !email.trim()} onClick={add}>
          Add or update
        </Button>
      </div>
      <p className="text-xs text-secondary">
        The person needs an account first — staff is granted to an existing user, never created here.
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-secondary">
          No stored operators.{" "}
          {envBootstrap
            ? "STAFF_EMAILS is set, so bootstrap addresses can still sign in."
            : "STAFF_EMAILS is empty too — set it before removing your own access."}
        </p>
      ) : (
        <ul className="divide-y divide-base-300 rounded-box border border-base-300">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-secondary">{m.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge color={m.role === "admin" ? "primary" : "neutral"} size="sm">
                  {m.role}
                </Badge>
                <Button size="sm" color="neutral" variant="outline" disabled={pending} onClick={() => run(() => setStaff({ email: m.email, role: m.role === "admin" ? "support" : "admin" }))}>
                  Make {m.role === "admin" ? "support" : "admin"}
                </Button>
                <Button size="sm" color="error" variant="outline" disabled={pending} onClick={() => run(() => setStaff({ email: m.email, role: null }))}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

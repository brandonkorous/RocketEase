"use client";

import { Badge, Button } from "@wizeworks/silicaui-react";
import { grantBeta, revokeBeta } from "@/lib/actions/staff";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type BetaCell = {
  feature: string;
  state: "enabled" | "disabled" | null;
  expiresAt: string | null;
  allowed: boolean;
  reason: string;
};

/** Status is icon+label, never colour alone (design.md, WCAG 2.2 AA). */
const LABEL: Record<string, { text: string; color: "success" | "neutral" | "warning" }> = {
  granted: { text: "In beta", color: "success" },
  granted_env: { text: "In beta (env)", color: "success" },
  revoked: { text: "Revoked", color: "neutral" },
  expired: { text: "Expired", color: "warning" },
  not_granted: { text: "Not granted", color: "neutral" },
};

export function BetaControl({ organizationId, cell, canEdit }: { organizationId: string; cell: BetaCell; canEdit: boolean }) {
  const { run, pending } = useActionFeedback();
  const badge = LABEL[cell.reason] ?? LABEL.not_granted;

  return (
    <div className="flex items-center gap-3">
      <Badge color={badge.color} size="sm">
        {badge.text}
      </Badge>
      {cell.expiresAt ? <span className="text-xs text-secondary">until {new Date(cell.expiresAt).toLocaleDateString()}</span> : null}
      {canEdit ? (
        cell.allowed ? (
          <Button size="sm" color="neutral" variant="outline" disabled={pending} onClick={() => run(() => revokeBeta({ organizationId, feature: cell.feature }))}>
            Revoke
          </Button>
        ) : (
          <Button size="sm" color="primary" disabled={pending} onClick={() => run(() => grantBeta({ organizationId, feature: cell.feature }))}>
            Grant
          </Button>
        )
      ) : null}
    </div>
  );
}

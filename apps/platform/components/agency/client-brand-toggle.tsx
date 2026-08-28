"use client";

import { setClientBrand } from "@/lib/actions/agency/branding";
import { useActionFeedback } from "@/lib/use-action-feedback";

/** Per-client switch: put the client's own brand on their reports instead of the agency's. */
export function ClientBrandToggle({ organizationId, workspaceId, checked, disabled }: { organizationId: string; workspaceId: string; checked: boolean; disabled: boolean }) {
  const { run, pending } = useActionFeedback();
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        className="checkbox checkbox-sm"
        checked={checked}
        disabled={disabled || pending}
        onChange={(e) => run(() => setClientBrand(organizationId, workspaceId, e.target.checked))}
      />
      <span className={checked ? "font-medium" : "text-secondary"}>{checked ? "Client brand" : "Agency brand"}</span>
    </label>
  );
}

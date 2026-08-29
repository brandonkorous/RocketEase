"use client";

import { GROUP_LABEL, type AccountGroup, type IntegrationRow } from "@/lib/accounts/types";
import { IntegrationLine } from "./row";

type Props = {
  group: AccountGroup;
  rows: IntegrationRow[];
  canManage: boolean;
  pending: boolean;
  showFooter: boolean;
  onSync: (row: IntegrationRow) => void;
  onDisconnect: (row: IntegrationRow) => void;
  onViewAll: (group: AccountGroup) => void;
};

export function GroupSection({ group, rows, canManage, pending, showFooter, onSync, onDisconnect, onViewAll }: Props) {
  return (
    <section aria-labelledby={`group-${group}`} className="border-b border-base-300 last:border-b-0">
      <h2 id={`group-${group}`} className="px-5 pt-4 text-base font-semibold">{GROUP_LABEL[group]}</h2>
      <ul className="mt-1 divide-y divide-base-300">
        {rows.map((r) => (<IntegrationLine key={`${r.group}:${r.id}`} row={r} canManage={canManage} pending={pending} onSync={onSync} onDisconnect={onDisconnect} />))}
      </ul>
      {showFooter && (
        <div className="px-5 pb-4 pt-1">
          <button type="button" onClick={() => onViewAll(group)} className="text-sm font-medium hover:underline">
            View all {GROUP_LABEL[group].toLowerCase()} →
          </button>
        </div>
      )}
    </section>
  );
}

/** Nothing matched, or nothing is connected yet — said plainly, never as a blank list. */
export function ListEmpty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-110 text-sm leading-relaxed text-secondary">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

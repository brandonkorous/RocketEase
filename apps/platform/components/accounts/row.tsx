"use client";

import { useState } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { CapabilityList } from "@/components/shared/why-not";
import type { IntegrationRow, StatusTone } from "@/lib/accounts/types";
import { NetMark } from "../net-mark";
import { QuotaGauge } from "./quota-gauge";

const DOT: Record<StatusTone, string> = { success: "bg-success", warning: "bg-warning", error: "bg-error", info: "bg-info", neutral: "bg-base-300" };

/** The row grid from the mockup: account · status · last sync · permissions · actions. */
const GRID = "grid gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto] lg:items-center";

type Props = { row: IntegrationRow; canManage: boolean; pending: boolean; onSync: (row: IntegrationRow) => void; onDisconnect: (row: IntegrationRow) => void };

export function IntegrationLine({ row, canManage, pending, onSync, onDisconnect }: Props) {
  const [open, setOpen] = useState(false);
  const hasDetail = row.detail.capabilities.length > 0 || !!row.detail.quota || !!row.detail.message;
  return (
    <li className="px-5 py-3.5">
      <div className={GRID}>
        <Identity row={row} open={open} hasDetail={hasDetail} onToggle={() => setOpen((v) => !v)} />
        <Cell top={<span className="flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${DOT[row.status.tone]}`} aria-hidden="true" />{row.status.label}</span>} bottom={row.status.detail} />
        <Cell top={row.syncRelative ?? "Not checked yet"} bottom={row.syncAbsolute ?? "No sync has run"} />
        <Cell top={row.access.label} bottom={row.access.detail} />
        <div className="flex items-center gap-1 justify-self-start lg:justify-self-end">
          {row.action?.href && <a href={row.action.href} className={buttonClasses({ size: "sm", variant: row.action.emphasis ? "solid" : "outline", color: row.action.emphasis ? "primary" : "neutral" })}>{row.action.label}</a>}
          <RowMenu row={row} canManage={canManage} pending={pending} hasDetail={hasDetail} onSync={onSync} onDisconnect={onDisconnect} onDetails={() => setOpen((v) => !v)} />
        </div>
      </div>
      {open && hasDetail && (
        <div className="mt-3 rounded-field bg-base-200 px-4 py-3">
          {row.detail.message && <p className="text-sm text-secondary">{row.detail.message}</p>}
          {row.detail.capabilities.length > 0 && <CapabilityList items={row.detail.capabilities} className="mt-1" />}
          {row.detail.quota && <QuotaGauge quota={row.detail.quota} />}
          {row.detail.scopes.length > 0 && <p className="mt-2 font-mono text-xs text-secondary/70">{row.detail.scopes.join(" · ")}</p>}
        </div>
      )}
    </li>
  );
}

function Identity({ row, open, hasDetail, onToggle }: { row: IntegrationRow; open: boolean; hasDetail: boolean; onToggle: () => void }) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field border border-base-300">{row.network ? <NetMark network={row.network} size={18} /> : <AnalyticsMark />}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{row.typeLabel}</span>
        <span className="block truncate text-sm text-secondary/70">{row.name}</span>
      </span>
    </>
  );
  if (!hasDetail) return <div className="flex items-center gap-3">{inner}</div>;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-3 rounded-field text-left hover:opacity-80">
      {inner}
    </button>
  );
}

function Cell({ top, bottom }: { top: React.ReactNode; bottom: string }) {
  return (
    <div className="min-w-0 text-sm">
      <div className="truncate font-medium">{top}</div>
      <div className="truncate text-secondary/70">{bottom}</div>
    </div>
  );
}

type MenuProps = Props & { hasDetail: boolean; onDetails: () => void };

function RowMenu({ row, canManage, pending, hasDetail, onSync, onDisconnect, onDetails }: MenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button size="sm" variant="ghost" color="neutral" aria-label={`More actions for ${row.typeLabel}`}>···</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-theme="rke" className="z-60 min-w-50 bg-base-100 text-base-content">
        <DropdownMenuGroup>
          {hasDetail && <DropdownMenuItem onClick={onDetails}>What this account can do</DropdownMenuItem>}
          {canManage && <DropdownMenuItem disabled={pending} onClick={() => onSync(row)}>Check now</DropdownMenuItem>}
          {row.managerUrl && <DropdownMenuItem onClick={() => window.open(row.managerUrl ?? "", "_blank", "noreferrer")}>Open in ad manager</DropdownMenuItem>}
        </DropdownMenuGroup>
        {canManage && <DropdownMenuSeparator />}
        {canManage && <DropdownMenuItem onClick={() => onDisconnect(row)}>Disconnect</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Conversion sources are not a social network; a neutral chart mark stands in. */
function AnalyticsMark() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Analytics source">
      <path d="M2 13.5V9m4 4.5V4m4 9.5V7m4 6.5V2.5" strokeLinecap="round" />
    </svg>
  );
}

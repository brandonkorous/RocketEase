"use client";

import { useRouter } from "next/navigation";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import type { AccountsData } from "@/lib/accounts/types";
import { NetMark } from "../net-mark";

/** Header action: every network this deployment can start, plus conversion sources. */
export function ConnectMenu({ data }: { data: AccountsData }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button color="primary" iconEnd={<Chevron />}>Connect account</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-theme="rke" className="z-60 min-w-60 bg-base-100 text-base-content">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Social and ad networks</DropdownMenuLabel>
          {data.connectable.map((p) => (
            <DropdownMenuItem key={p.key} onClick={() => { window.location.href = `/api/connect/${p.key}/start?workspaceId=${data.workspaceId}`; }}>
              <span className="flex items-center gap-2">{p.networks[0] && <NetMark network={p.networks[0]} size={16} />}{p.displayName}</span>
            </DropdownMenuItem>
          ))}
          {data.connectable.length === 0 && <DropdownMenuItem disabled>No network is configured in this deployment</DropdownMenuItem>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Conversions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(workspacePath(data.workspaceId, "settings/tracking"))}>Conversion source…</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Chevron() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

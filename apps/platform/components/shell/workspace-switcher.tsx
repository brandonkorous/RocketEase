"use client";

import { useRouter } from "next/navigation";
import { Avatar, Badge, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import type { WorkspaceSummary } from "@/lib/session";
import { ChevronsIcon } from "./icons";

export function WorkspaceSwitcher({ workspace, workspaces }: { workspace: WorkspaceSummary; workspaces: WorkspaceSummary[] }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button type="button" className="flex w-full items-center gap-2.5 rounded-field border border-base-300 px-2.5 py-2 text-left hover:bg-base-200" aria-label={`Workspace: ${workspace.name}. Switch workspace`}>
          <Avatar size="xs" shape="rounded" color="neutral" alt="">{workspace.name.slice(0, 2).toUpperCase()}</Avatar>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold leading-tight">{workspace.name}</span><span className="block truncate text-xs leading-tight opacity-60">{workspace.organizationName}</span></span>
          <ChevronsIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-theme="mis" className="z-60 min-w-65 bg-base-100 text-base-content">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => router.push(workspacePath(w.id))}>
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{w.name}</span><span className="block truncate text-xs opacity-60">{w.organizationName} · {w.role.replace("_", " ")}</span></span>
                {w.id === workspace.id && <Badge size="xs" variant="soft" color="neutral">Current</Badge>}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/agency")}>Agency overview</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/onboarding/workspace")}>New workspace…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

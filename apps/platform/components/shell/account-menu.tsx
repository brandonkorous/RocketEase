"use client";

import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@wizeworks/silicaui-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { workspacePath } from "@/lib/nav";

export type ShellUser = { name: string; email: string; image?: string | null };

export function useSignOut() {
  const router = useRouter();
  return async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); };
}

export function AccountMenu({ user, role, workspaceId }: { user: ShellUser; role: string; workspaceId: string }) {
  const router = useRouter();
  const signOut = useSignOut();
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button type="button" className="flex w-full items-center gap-2.5 rounded-field px-2 py-2 text-left hover:bg-base-200" aria-label="Account menu">
          <Avatar size="xs" color="neutral" alt="" src={user.image ?? undefined}>{initials || "?"}</Avatar>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium leading-tight">{user.name}</span><span className="block truncate text-xs capitalize leading-tight opacity-60">{role.replace("_", " ")}</span></span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" data-theme="mis" className="z-60 min-w-55 bg-base-100 text-base-content">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(workspacePath(workspaceId, "settings/security"))}>Security & sessions</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

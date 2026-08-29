"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell, AppShellMain, AppShellSidebar, Badge, Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarHeaderBrand, SidebarItem } from "@wizeworks/silicaui-react";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";
import { MANAGE_NAV, PRIMARY_NAV, workspacePath, type NavKey } from "@/lib/nav";
import type { WorkspaceSummary } from "@/lib/session";
import { AccountMenu, type ShellUser } from "./shell/account-menu";
import { BellIcon, NAV_ICONS } from "./shell/icons";
import { MobileDock, MobileHeader, MoreDrawer } from "./shell/mobile-nav";
import { WorkspaceSwitcher } from "./shell/workspace-switcher";

type Props = { workspace: WorkspaceSummary; workspaces: WorkspaceSummary[]; user: ShellUser; badges?: Partial<Record<NavKey, number>>; unread?: number; children: React.ReactNode };
type NavItem = { key: NavKey; label: string; segment: string };

export function WorkspaceShell({ workspace, workspaces, user, badges = {}, unread = 0, children }: Props) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (segment: string) => pathname.startsWith(`/app/${workspace.id}/${segment.split("/")[0]}`);
  const switcher = <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />;

  const navItem = (item: NavItem) => (
    <SidebarItem key={item.key} as={Link} href={workspacePath(workspace.id, item.segment)} icon={NAV_ICONS[item.key]} active={isActive(item.segment)} trailing={badges[item.key] ? <Badge size="xs" color="primary" aria-label={`${badges[item.key]} needing attention`}>{badges[item.key]}</Badge> : undefined}>
      {item.label}
    </SidebarItem>
  );

  return (
    <AppShell className="min-h-dvh">
      <AppShellSidebar className="hidden md:block">
        <div data-theme="rke-dark" className="flex h-full w-64 flex-col bg-base-100 text-base-content">
          <Sidebar className="h-full w-full border-0 bg-transparent">
            <SidebarHeader className="flex-col items-stretch gap-3 px-3 pt-4 pb-2">
              <SidebarHeaderBrand><Link href="/" className="flex items-center gap-2 px-1 font-bold" aria-label="RocketEase"><Mark size={24} /><Wordmark /></Link></SidebarHeaderBrand>
              {switcher}
            </SidebarHeader>
            <SidebarContent className="px-2">
              <SidebarGroup>{PRIMARY_NAV.map(navItem)}</SidebarGroup>
              <SidebarGroup><SidebarGroupLabel>Manage</SidebarGroupLabel>{MANAGE_NAV.map(navItem)}</SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="px-2 pb-3">
              <SidebarItem as={Link} href={workspacePath(workspace.id, "notifications")} icon={<BellIcon />} active={pathname.endsWith("/notifications")} trailing={unread ? <Badge size="xs" color="primary" aria-label={`${unread} unread notifications`}>{unread}</Badge> : undefined}>Notifications</SidebarItem>
              <AccountMenu user={user} role={workspace.role} workspaceId={workspace.id} />
            </SidebarFooter>
          </Sidebar>
        </div>
      </AppShellSidebar>
      <AppShellMain className="flex min-w-0 flex-col bg-base-100">
        <MobileHeader switcher={switcher} setOpen={setMoreOpen} />
        <div className="flex-1 pb-20 md:pb-0">{children}</div>
        <MobileDock workspaceId={workspace.id} isActive={isActive} setOpen={setMoreOpen} />
        <MoreDrawer workspaceId={workspace.id} open={moreOpen} setOpen={setMoreOpen} />
      </AppShellMain>
    </AppShell>
  );
}

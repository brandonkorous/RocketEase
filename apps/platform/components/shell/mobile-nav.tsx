"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Dock, DockItem, DockLabel, Drawer, DrawerContent, DrawerTitle } from "@wizeworks/silicaui-react";
import { MenuIcon } from "@rocketease/ui/icons";
import { MANAGE_NAV, MOBILE_NAV, PRIMARY_NAV, workspacePath } from "@/lib/nav";
import { useSignOut } from "./account-menu";
import { BellIcon, NAV_ICONS } from "./icons";

type Props = { workspaceId: string; isActive: (segment: string) => boolean; open: boolean; setOpen: (v: boolean) => void; switcher: React.ReactNode };

export function MobileHeader({ switcher, setOpen }: Pick<Props, "switcher" | "setOpen">) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3 md:hidden">
      <div className="min-w-0 flex-1">{switcher}</div>
      <Button variant="ghost" color="neutral" shape="square" aria-label="More" onClick={() => setOpen(true)}><MenuIcon /></Button>
    </header>
  );
}

/** On phones "Create" opens the linear quick-compose flow instead of the three-pane composer. */
const mobileSegment = (key: string, segment: string) => (key === "create" ? "create/quick" : segment);

export function MobileDock({ workspaceId, isActive, setOpen }: Pick<Props, "workspaceId" | "isActive" | "setOpen">) {
  const router = useRouter();
  return (
    <Dock className="fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100 md:hidden">
      {PRIMARY_NAV.filter((n) => MOBILE_NAV.includes(n.key)).map((n) => (
        <DockItem key={n.key} active={isActive(n.segment)} onClick={() => router.push(workspacePath(workspaceId, mobileSegment(n.key, n.segment)))}>{NAV_ICONS[n.key]}<DockLabel>{n.label}</DockLabel></DockItem>
      ))}
      <DockItem onClick={() => setOpen(true)}><MenuIcon size={18} /><DockLabel>More</DockLabel></DockItem>
    </Dock>
  );
}

export function MoreDrawer({ workspaceId, open, setOpen }: Pick<Props, "workspaceId" | "open" | "setOpen">) {
  const signOut = useSignOut();
  const items = [...PRIMARY_NAV.filter((n) => !MOBILE_NAV.includes(n.key)), ...MANAGE_NAV];
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent side="bottom">
        <DrawerTitle>More</DrawerTitle>
        <nav className="mt-3 grid grid-cols-2 gap-2" aria-label="More">
          <Link href={workspacePath(workspaceId, "notifications")} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-field border border-base-300 px-3 py-3 text-sm font-medium">
            <span className="[&>svg]:h-4.5 [&>svg]:w-4.5"><BellIcon /></span>Notifications
          </Link>
          {items.map((n) => (
            <Link key={n.key} href={workspacePath(workspaceId, n.segment)} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-field border border-base-300 px-3 py-3 text-sm font-medium">
              <span className="[&>svg]:h-4.5 [&>svg]:w-4.5">{NAV_ICONS[n.key]}</span>{n.label}
            </Link>
          ))}
          <button type="button" onClick={signOut} className="col-span-2 rounded-field px-3 py-3 text-left text-sm font-medium text-secondary">Sign out</button>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}

import { Badge, Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarHeaderBrand, SidebarItem } from "@wizeworks/silicaui-react";
import { CalendarIcon, ChartIcon, FolderIcon, HomeIcon, InboxIcon, Mark, SendIcon, SettingsIcon, ShieldIcon } from "@make-it-social/ui/icons";

/** Illustrative app sidebar: black rail, product nav, no platform color. */
export function AppSidebar({ active }: { active: "calendar" | "home" }) {
  return (
    <div data-theme="mis-dark" className="hidden w-42 shrink-0 self-stretch bg-base-100 text-base-content md:block">
      <Sidebar className="h-full w-full border-0 bg-transparent text-xs">
        <SidebarHeader className="px-3 pt-3 pb-1">
          <SidebarHeaderBrand>
            <span className="flex items-center gap-2 font-bold">
              <Mark size={20} />
              Make It Social
            </span>
          </SidebarHeaderBrand>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarItem icon={<HomeIcon />} active={active === "home"}>Home</SidebarItem>
            <SidebarItem icon={<CalendarIcon size={18} />} active={active === "calendar"}>Calendar</SidebarItem>
            <SidebarItem icon={<SendIcon size={18} />}>Create</SidebarItem>
            <SidebarItem icon={<InboxIcon size={18} />} trailing={<Badge size="xs" color="primary">12</Badge>}>Inbox</SidebarItem>
            <SidebarItem icon={<FolderIcon />}>Campaigns</SidebarItem>
            <SidebarItem icon={<ChartIcon size={18} />}>Analytics</SidebarItem>
            <SidebarItem icon={<ShieldIcon />}>Approvals</SidebarItem>
            <SidebarItem icon={<SettingsIcon />}>Settings</SidebarItem>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  );
}

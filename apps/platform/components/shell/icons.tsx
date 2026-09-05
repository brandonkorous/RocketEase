import { CalendarIcon, ChartIcon, FolderIcon, HomeIcon, ImageIcon, InboxIcon, SendIcon, SettingsIcon, ShieldIcon } from "@rocketease/ui/icons";
import type { NavKey } from "@/lib/nav";

const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const PlugIcon = () => <svg {...p}><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" /></svg>;
export const UsersIcon = () => <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
export const BellIcon = () => <svg {...p}><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" /></svg>;
export const BrandIcon = () => <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" /><circle cx="12" cy="15" r="1" /></svg>;
export const ChevronsIcon = () => <svg width="14" height="14" {...p} strokeWidth={2}><path d="m7 9 5-5 5 5M7 15l5 5 5-5" /></svg>;
export const GridIcon = () => <svg width="18" height="18" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;

export const NAV_ICONS: Record<NavKey, React.ReactNode> = {
  home: <HomeIcon />, calendar: <CalendarIcon size={18} />, grid: <GridIcon />, create: <SendIcon size={18} />, inbox: <InboxIcon size={18} />, campaigns: <FolderIcon />, analytics: <ChartIcon size={18} />,
  content: <ImageIcon size={18} />, brand: <BrandIcon />, approvals: <ShieldIcon />, accounts: <PlugIcon />, team: <UsersIcon />, settings: <SettingsIcon />,
};

/*
 * Route map and navigation labels from docs/originals/navigation.md.
 * Names are product vocabulary: "Calendar" (never Planner), "Create" (Composer
 * is internal), "Connected accounts" (Integrations is the public ecosystem).
 */
export type NavKey =
  | "home"
  | "calendar"
  | "create"
  | "inbox"
  | "campaigns"
  | "analytics"
  | "content"
  | "brand"
  | "approvals"
  | "accounts"
  | "team"
  | "settings";

export const PRIMARY_NAV: { key: NavKey; label: string; segment: string }[] = [
  { key: "home", label: "Home", segment: "home" },
  { key: "calendar", label: "Calendar", segment: "calendar" },
  { key: "create", label: "Create", segment: "create" },
  { key: "inbox", label: "Inbox", segment: "inbox" },
  { key: "campaigns", label: "Campaigns", segment: "campaigns" },
  { key: "analytics", label: "Analytics", segment: "analytics" },
  { key: "content", label: "Content", segment: "content" },
  { key: "brand", label: "Brand", segment: "brand" },
  { key: "approvals", label: "Approvals", segment: "approvals" },
];

export const MANAGE_NAV: { key: NavKey; label: string; segment: string }[] = [
  { key: "accounts", label: "Connected accounts", segment: "accounts" },
  { key: "team", label: "Team", segment: "team" },
  { key: "settings", label: "Settings", segment: "settings/general" },
];

/** Mobile bottom navigation: Home, Calendar, Create, Inbox, More. */
export const MOBILE_NAV: NavKey[] = ["home", "calendar", "create", "inbox"];

export const SETTINGS_SECTIONS = [
  { slug: "general", label: "General" },
  { slug: "team", label: "Team and roles" },
  { slug: "notifications", label: "Notifications" },
  { slug: "inbox", label: "Inbox" },
  { slug: "automations", label: "Automations" },
  { slug: "recycling", label: "Recycling" },
  { slug: "hashtags", label: "Hashtag sets" },
  { slug: "tracking", label: "Tracking" },
  { slug: "rights", label: "Rights and authorisations" },
  { slug: "accounts", label: "Connected accounts" },
  { slug: "api", label: "API keys" },
  { slug: "billing", label: "Billing" },
  { slug: "security", label: "Security" },
  { slug: "sso", label: "Single sign-on" },
  { slug: "audit", label: "Audit log" },
] as const;

export const workspacePath = (workspaceId: string, segment = "home") => `/app/${workspaceId}/${segment}`;

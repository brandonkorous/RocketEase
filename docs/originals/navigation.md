# Navigation

## Model

Navigation follows recurring work, while the lifecycle remains the conceptual backbone. The active organization and workspace are persistent context.

## Desktop application

Black sidebar:

1. RocketEase mark
2. Organization/workspace switcher
3. Home
4. Calendar
5. Grid
6. Create
7. Inbox
8. Campaigns
9. Analytics
10. Content
11. Brand
12. Approvals
13. Collapsible “Manage” group: Connected accounts, Team, Settings
14. Help, notifications, profile

Use badges only for actionable counts: overdue approvals, unresolved assigned conversations, publish failures, or connection problems. The sidebar remains structurally monochrome; small platform marks may appear inside scoped content, not as navigation decoration.

## Route map

```text
/app/:workspaceId/home
/app/:workspaceId/calendar
/app/:workspaceId/grid
/app/:workspaceId/create
/app/:workspaceId/posts/:postId
/app/:workspaceId/inbox
/app/:workspaceId/inbox/:conversationId
/app/:workspaceId/campaigns
/app/:workspaceId/campaigns/:campaignId
/app/:workspaceId/analytics
/app/:workspaceId/reports/:reportId
/app/:workspaceId/content
/app/:workspaceId/brand
/app/:workspaceId/brand/:section
/app/:workspaceId/approvals
/app/:workspaceId/accounts
/app/:workspaceId/team
/app/:workspaceId/settings/:section
/agency
/onboarding
```

URLs preserve shareable state for date ranges, filters, selected tabs, and search where safe. Never include tokens or sensitive provider identifiers.

## Workspace switching

The switcher shows organization, client/brand name, avatar/mark, role, and connection/attention indicators. Switching clears incompatible selections and confirms before abandoning unsaved work. Recent and pinned workspaces appear first; search supports large agency portfolios.

## Contextual navigation

- Campaign detail: Overview, Content, Ads, Audience, Conversations, Performance, Activity.
- Settings: General, Team and roles, Notifications, Connected accounts, Billing, Security, Audit log.
- Brand: Overview, Identity, Voice, Visual identity, Messaging, Audiences, Rules, Assets, Channel presence.
- Analytics: Overview, Content, Engagement, Audience, Paid, Reports.
- Composer: Content, Channels, Preview, Settings; use progressive sections rather than nested app navigation.
- Grid: one channel at a time; per-surface tabs only where the network renders more than one grid (Instagram: Posts, Reels; YouTube: Videos, Shorts).

## Mobile

Bottom navigation contains Home, Calendar, Create, Inbox, and More. More opens Grid, Campaigns, Analytics, Content, Brand, Approvals, Accounts, and Settings. Workspace switching is available from the header. A selected desktop three-pane object becomes a full-screen detail with a clear back path.

## Global utilities

Command/search opens workspaces, campaigns, posts, conversations, assets, and pages, restricted by access. Notifications deep-link to the exact object and preserve workspace context. Help is contextual. Browser back/forward must work for drawers that represent meaningful selection.

## Naming rules

Use “Calendar,” not Planner/Scheduler interchangeably. Use “Create” for the entry action and “Composer” only in internal implementation language. Use “Connected accounts” for product settings and “Integrations” for the public ecosystem or non-social systems. Use “Campaigns” for the combined organic/paid container and “Ads” within campaign detail. Use “Grid” for the profile preview, never “Feed Planner,” “Visual Planner,” or “Grid Planner” (competitor names; “Planner” is excluded by the Calendar rule).

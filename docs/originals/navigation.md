# Navigation

## Model

Navigation follows recurring work, while the lifecycle remains the conceptual backbone. The active organization and workspace are persistent context.

## Desktop application

Black sidebar:

1. Make It Social mark
2. Organization/workspace switcher
3. Home
4. Calendar
5. Create
6. Inbox
7. Campaigns
8. Analytics
9. Content
10. Approvals
11. Collapsible “Manage” group: Connected accounts, Team, Settings
12. Help, notifications, profile

Use badges only for actionable counts: overdue approvals, unresolved assigned conversations, publish failures, or connection problems. The sidebar remains structurally monochrome; small platform marks may appear inside scoped content, not as navigation decoration.

## Route map

```text
/app/:workspaceId/home
/app/:workspaceId/calendar
/app/:workspaceId/create
/app/:workspaceId/posts/:postId
/app/:workspaceId/inbox
/app/:workspaceId/inbox/:conversationId
/app/:workspaceId/campaigns
/app/:workspaceId/campaigns/:campaignId
/app/:workspaceId/analytics
/app/:workspaceId/reports/:reportId
/app/:workspaceId/content
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
- Settings: General, Brand, Team and roles, Notifications, Connected accounts, Billing, Security, Audit log.
- Analytics: Overview, Content, Engagement, Audience, Paid, Reports.
- Composer: Content, Channels, Preview, Settings; use progressive sections rather than nested app navigation.

## Mobile

Bottom navigation contains Home, Calendar, Create, Inbox, and More. More opens Campaigns, Analytics, Content, Approvals, Accounts, and Settings. Workspace switching is available from the header. A selected desktop three-pane object becomes a full-screen detail with a clear back path.

## Global utilities

Command/search opens workspaces, campaigns, posts, conversations, assets, and pages, restricted by access. Notifications deep-link to the exact object and preserve workspace context. Help is contextual. Browser back/forward must work for drawers that represent meaningful selection.

## Naming rules

Use “Calendar,” not Planner/Scheduler interchangeably. Use “Create” for the entry action and “Composer” only in internal implementation language. Use “Connected accounts” for product settings and “Integrations” for the public ecosystem or non-social systems. Use “Campaigns” for the combined organic/paid container and “Ads” within campaign detail.

# Page inventory

Every page must define loading, partial loading, empty, error, permission-denied, degraded integration, and success states; keyboard order; mobile behavior; analytics events; and data freshness where relevant.

## Core application pages

### Home

Attention queue, upcoming posts, assigned conversations, approvals, connection health, and concise performance pulse. Agency users get a client overview before entering a workspace.

### Calendar

Month/week/list, channel/campaign/status/assignee filters, timezone, post previews, drag/reschedule, bulk actions, and create entry. Empty calendar teaches the first post flow.

### Create and post detail

Shared content, per-channel variants, media, accessibility fields, campaign, tracking, schedule, approvals, previews, validation, comments, and version/activity history. Mobile uses a linear focused flow.

### Inbox and conversation detail

Three-column desktop layout: queue, thread, context. Include type/status/priority/assignee filters, unread state, saved replies, internal notes, customer/channel context, SLA timestamps, and provider send state.

### Campaigns

List/table with objective, status, dates, owner, channels, spend, outcomes, and alerts. Campaign detail tabs: Overview, Content, Ads, Audience, Conversations, Performance, Activity. It is the strongest proof of the paid-plus-organic proposition.

### Analytics and reports

Persistent date/comparison and scope filters; scorecards; trends; channel breakdown; campaign attribution; paid/organic split; top content; freshness and definitions; save, export, and scheduled reports.

### Content library

Grid/list, asset preview, video/image/document types, folders/tags, rights/expiry, search, filters, bulk actions, usage references, templates, upload/import, and reuse. Protect referenced and scheduled assets.

### Approvals

Queue by status/due date/assignee/campaign, preview and diff, comments, request changes, approve/reject, version history, bulk decisions, and stale-version handling. Client approver view is deliberately narrow.

### Connected accounts

Provider cards/rows with channel identity, capability summary, scopes, health, last sync, reconnect, and disconnect. Include OAuth return, channel selection, initial sync, permission error, and provider outage states.

### Team and settings

General workspace, members/invitations, roles, approval policies, notifications, connected accounts, billing, security/sessions, data/privacy, and audit log. Settings use stable subsections and explicit save/impact feedback.

### Brand

First-level area (decision, 2026-08-28: brand moved out of Settings because it is an input to the work, not a preference). Overview states completeness and what each gap costs; sections cover identity, voice, visual identity (logo variants, palette, typography, imagery direction), approved messaging with dated offers, audiences, compliance rules, brand assets, and per-network profile copy. Everything is entered by a person — the product never infers a brand fact — and drafting, image generation, and client reports read from it.

### Agency overview

Searchable client workspace list with pinned/recent clients, upcoming work, overdue approvals, inbox backlog, failed posts, connection health, and performance direction. No mutation without entering a workspace.

## Authentication and onboarding

Sign in, sign up, password/reset or passwordless flow, identity verification, MFA, invitation acceptance, organization/workspace creation, goals, channel connection, team invitation, and first-post path. Auth screens retain the black/white brand without decorative marketing layout.

## Mobile surfaces

Purpose-built Home, Calendar agenda/month, quick Create, Inbox queue/thread, approval review, notification center, workspace switcher, and More menu. Dense analytics defaults to a concise summary and drill-down rather than unreadable desktop charts.

## Public pages

- Landing page centered on “Effortless Launch. Better by Design.” and real product surfaces.
- Features overview organized by the product lifecycle.
- Reusable feature detail template for Publishing, Inbox, Campaigns/Ads, Analytics, Collaboration, and Agencies.
- Pricing with honest limits and no invented claims.
- Integrations directory/detail with current capabilities.
- Security/privacy, help, status, terms, and contact/demo.

Public pages share the product system: black/white structure, product proof, platform color only for identity, no gradients, eyebrows, editorial styling, invented customers, testimonials, or statistics.

## Page-level release acceptance

A page is complete only when authorization is server-enforced; primary tasks work with keyboard and at 320px width; empty/error/degraded states are designed; sensitive actions are audited; strings are localization-ready; telemetry excludes content/PII; and critical paths have automated tests.

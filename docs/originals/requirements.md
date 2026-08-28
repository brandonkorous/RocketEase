# Requirements

Requirement IDs are stable references. Priority: P0 launch-blocking, P1 required soon after MVP, P2 later.

## Functional requirements

### Tenancy and access

- **TEN-001 P0:** Users can belong to multiple organizations and workspaces with independent roles.
- **TEN-002 P0:** Every read/write is server-authorized and tenant scoped.
- **TEN-003 P0:** Agency users can view cross-client attention summaries without cross-client mutation.
- **TEN-004 P0:** Membership, permission, security, publishing, approval, export, and spend actions are audited.

### Connections

- **INT-001 P0:** Owners/admins can connect, select, reconnect, and disconnect supported channels through secure OAuth.
- **INT-002 P0:** The product records capabilities, scopes, health, freshness, and actionable errors per channel.
- **INT-003 P0:** Webhooks and polling are deduplicated and reconciled.

### Content and publishing

- **PUB-001 P0:** Users can create shared content with channel-specific variants and previews.
- **PUB-002 P0:** Drafts autosave and retain immutable approval-relevant versions.
- **PUB-003 P0:** Users can publish now or schedule using explicit workspace timezone.
- **PUB-004 P0:** Execution revalidates content, permission, connection, capability, media rights, and approval.
- **PUB-005 P0:** Multi-channel outcomes are reported per variant; retries do not duplicate successful publications.
- **PUB-006 P1:** Calendar supports safe bulk rescheduling and reusable templates.

### Collaboration

- **COL-001 P0:** Configurable approval policies route work by workspace/channel/role/campaign.
- **COL-002 P0:** Reviewers can approve, request changes with comment, or reject an immutable version.
- **COL-003 P0:** Comments, assignments, due dates, notifications, and activity history attach to work.
- **COL-004 P1:** External client approvers receive narrowly scoped access.

### Engagement

- **ENG-001 P0:** Supported comments/messages/mentions normalize into a searchable/filterable inbox.
- **ENG-002 P0:** Users can assign, reply, note, snooze, and resolve with provider delivery state.
- **ENG-003 P0:** The system prevents duplicate replies after ambiguous provider timeouts.
- **ENG-004 P1:** Saved replies and configurable response targets are available.

### Campaigns, ads, analytics

- **CAM-001 P0:** Campaigns group organic content, objectives, dates, owner, tracking, and imported paid results.
- **CAM-002 P1:** Eligible published content can be promoted through supported providers with policy and budget controls.
- **ANA-001 P0:** Users can filter analytics by date, comparison, campaign, channel, network, and paid/organic scope.
- **ANA-002 P0:** Metrics expose definition, source, freshness, timezone, and unavailable state.
- **ANA-003 P0:** Users can export CSV; **P1:** save and schedule branded reports.

### Content library and administration

- **LIB-001 P0:** Users can upload, search, filter, tag, folder, preview, reuse, and inspect asset usage.
- **LIB-002 P0:** Assets include scan, rendition, accessibility, rights, and expiry metadata.
- **ADM-001 P0:** Settings cover workspace, members/roles, notifications, accounts, billing handoff, security, and audit.
- **ONB-001 P0:** Onboarding is resumable and includes workspace, goals, connection, invitation, and first-value action.

## Non-functional requirements

- **NFR-001 Security:** Follow OWASP guidance; encrypt secrets; require signed/replay-protected webhooks; complete threat modeling and security review before GA.
- **NFR-002 Accessibility:** WCAG 2.2 AA for supported workflows, including keyboard, screen reader, zoom, contrast, and reduced motion.
- **NFR-003 Reliability:** No duplicate publish caused by internal retry. Target 99.9% application availability excluding documented provider outages; establish GA SLOs from beta evidence.
- **NFR-004 Performance:** P75 interactive app navigation under 2.5s on representative broadband; immediate local feedback under 100ms where feasible; long lists virtualized.
- **NFR-005 Freshness:** Show freshness always; target webhook processing under 60s P95 and scheduled job start within 60s P95, subject to provider behavior.
- **NFR-006 Privacy:** Data minimization, consent/notice, export/deletion workflows, configurable retention, and no sensitive content in telemetry/logs.
- **NFR-007 Internationalization:** Locale-ready strings, Unicode, timezone-aware scheduling, locale formats, and ISO currency handling.
- **NFR-008 Observability:** Correlated logs/traces/metrics, provider health, queue lag, reconciliation, and auditable operator actions.

## MVP release gates

- Critical create → approve → schedule → publish and ingest → reply flows pass end-to-end tests.
- Tenant isolation and authorization tests cover every domain.
- Accessibility review has no known critical/high-impact blockers.
- Publish ambiguity, expired tokens, provider outage, partial success, and webhook replay have tested recovery.
- Backup restoration and incident runbooks are exercised.
- Support matrix, metric definitions, retention policy, terms/privacy, and provider approvals are current.

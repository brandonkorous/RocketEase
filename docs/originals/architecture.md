# Architecture

## Goals

Build a multi-tenant SaaS that publishes safely, absorbs unreliable provider APIs, maintains explainable analytics, and prevents cross-workspace access. Prefer a modular monolith for core product velocity, with isolated worker processes and clear domain boundaries that can split when scale requires it.

## Logical components

```text
Web/mobile clients
        |
Application API and authorization
        |
-------------------------------------------------
Identity | Workspaces | Content | Inbox | Campaigns
Approvals | Reporting | Integrations | Billing | Audit
-------------------------------------------------
        |                 |                 |
 Relational DB       Job queue/workers   Object storage
        |                 |
 Search/read models  Provider adapters/webhooks
                          |
                    Social and ad APIs
```

## Domain boundaries

- Identity and tenancy: authentication, organizations, workspaces, membership, authorization.
- Content: items, variants, media, versions, validation, calendar.
- Publishing: scheduling, jobs, provider execution, reconciliation.
- Engagement: normalized conversations, messages, assignment, replies.
- Campaigns and paid: combined campaign model, imported/managed ad objects, budgets.
- Analytics: ingestion, normalization, attribution, reporting, exports.
- Integrations: tokens, capabilities, webhooks, sync cursors, health.
- Collaboration: approvals, comments, notifications, audit.

Domains communicate through transactional records and versioned events. Avoid a shared “miscellaneous social object.”

## Request and job patterns

Interactive writes validate authorization and persist intent quickly. Slow provider operations run asynchronously. Use transactional outbox delivery, idempotency keys, exponential backoff with jitter, provider-aware rate limiting, dead-letter handling, and operator replay tools.

Publishing revalidates token, capability, content version, approval, asset access, and schedule immediately before execution. Provider success is not final until a remote ID is recorded. Ambiguous timeouts enter reconciliation before retry to prevent duplicates.

## Integration adapters

Each provider adapter implements capability discovery, credential refresh, validation, publish, status fetch, inbox ingest/reply, analytics ingest, ad import/manage, and webhook verification as supported. The UI reads capability flags; it must not assume parity.

## Data and read models

Transactional entities use the relational store. Calendar, inbox queue, dashboard attention, and reporting can use denormalized read models updated from events. Derived indexes and aggregates are rebuildable. Raw provider payloads may be retained briefly with redaction and access controls for debugging.

## Security

- Tenant scoping and authorization on every server operation.
- OAuth tokens encrypted with managed keys; secret values never enter logs or clients.
- CSRF protection, secure cookies, CSP, input validation, signed upload/download URLs.
- Webhook signature verification and replay protection.
- MFA and session management; SSO/SCIM later based on plan.
- Immutable, access-controlled audit events.
- Dependency, secret, SAST, and infrastructure scanning in CI.
- Threat model publishing, inbox replies, ad spend, exports, and agency switching before release.

## Reliability and observability

Use structured logs, traces, metrics, request/job IDs, provider error taxonomy, and per-connector health dashboards. Measure queue delay, job attempts, publish success, webhook lag, sync freshness, API latency/error rate, and reconciliation backlog. Alerts should map to runbooks and user-visible incidents.

Back up transactional data and test restoration. Define RPO/RTO before GA. Use feature flags and staged rollouts for provider changes. Provider incidents degrade only affected capabilities; drafts, local collaboration, and unaffected channels remain usable.

## Suggested implementation baseline

Web: TypeScript, React, server-rendered application framework, shared accessible component system. API: typed application layer with generated contracts. Database: PostgreSQL. Queue/cache: managed Redis-compatible service or durable cloud queue. Media: S3-compatible object storage and managed transcoding where needed. Analytics: begin with PostgreSQL aggregates; add a columnar warehouse after measured need.

These are defaults, not irreversible requirements. Record major choices in ADRs with context, alternatives, decision, and consequences.

## Environments and delivery

Separate local, preview, staging, and production. Never reuse production provider credentials in lower environments. CI runs schema, type, unit, integration, accessibility, and critical end-to-end checks. Database migrations are forward-compatible and observable. Deploy application and workers independently, with rollback or roll-forward procedures.

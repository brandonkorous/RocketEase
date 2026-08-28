# Integrations

## Initial provider strategy

Prioritize Instagram/Facebook through Meta, LinkedIn, and TikTok, subject to current API access and review. Add YouTube, Pinterest, X, Google Analytics, commerce/CRM, storage, and collaboration systems after user demand and provider feasibility are validated. Provider capabilities and commercial terms change; confirm them during implementation and release planning.

## Capability model

Represent support per connected channel rather than a marketing-wide yes/no:

- compose and publish formats
- schedule or immediate publish
- comments, mentions, messages, reviews, and reply
- organic insights
- ad accounts, campaigns, audiences, creative, spend, and conversion data
- direct ad mutation versus read-only import
- webhook versus polling
- limits, required permissions, and freshness

Capabilities include reason and last-checked time. UI validation and controls derive from this model.

## Connection flow

1. User selects provider and sees requested access in plain language.
2. Server creates signed OAuth state tied to user, organization, workspace, nonce, and expiry.
3. Provider consent returns to a server callback.
4. Server exchanges and encrypts credentials; retrieves eligible channels.
5. User explicitly chooses which channels/ad accounts belong to the workspace.
6. System records scopes/capabilities, registers webhooks, performs initial sync, and reports health.

Never infer workspace assignment from the first account returned. Reauthorization preserves internal references where provider identity is unchanged.

## Connection states

`connecting`, `syncing`, `healthy`, `degraded`, `action_required`, `revoked`, `disconnected`.

Connected Accounts shows provider, channel identity, granted capabilities, token/permission health, last sync, error summary, reconnect action, and disconnect impact. Disconnect stops future actions and sync, revokes remotely when possible, removes secrets, and explains retained historical data.

## Ingestion

Prefer verified webhooks for timely events and polling for reconciliation/backfill. Acknowledge webhook receipt quickly, deduplicate, then process asynchronously. Maintain resource-specific cursors and bounded backfills. Normalize data without discarding raw provenance or provider timestamps.

## Publishing and replies

Validate with provider-current rules at execution. Use idempotency and remote lookup after ambiguous errors. Map provider errors into actionable categories: permission, validation, rate limit, temporary provider failure, deleted remote object, policy restriction, or unknown. Never repeatedly retry permanent failures.

## Analytics and ads

Store provider definitions, grain, timezone, currency, freshness, and revisions. Clearly label estimates, modeled conversions, and unavailable metrics. For unsupported ad mutations, provide a read-only performance view and a deep link to the native manager. Spend-changing actions require explicit authorization, confirmation, limits, and audit.

## Test and operations

Maintain adapter contract tests, provider sandboxes/test accounts where available, recorded sanitized fixtures, clock/rate-limit tests, webhook signature cases, and periodic live smoke tests. Feature flags can disable a format or mutation without disabling the entire provider.

## Compliance

Follow provider terms, data minimization, deletion callbacks, privacy requests, brand/logo rules, and app-review requirements. Keep an owner, review date, support matrix, and deprecation plan for every connector.

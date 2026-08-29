# Data model

## Tenancy and identity

- `User`: person identity, authentication factors, locale, timezone.
- `Organization`: ownership, subscription, policy, legal and billing boundary.
- `OrganizationMembership`: user, organization role, status.
- `Workspace`: brand/client boundary, timezone, locale, brand settings.
- `WorkspaceMembership`: user, workspace role/grants, invitation state.

All tenant-owned records include `organization_id`; workspace records also include `workspace_id`. Use opaque sortable identifiers. Store timestamps in UTC and retain the intended scheduling timezone.

## Connections

- `ProviderConnection`: OAuth grant metadata, encrypted secret reference, scopes, health, expiry.
- `Channel`: social profile/page/ad account, provider, remote ID, capabilities, status.
- `SyncCursor`: resource, provider cursor, freshness, last success/error.
- `WebhookReceipt`: provider event ID, signature result, received/processed timestamps, dedupe status.

## Content and workflow

- `Campaign`
- `ContentItem`
- `ContentVersion`
- `PostVariant`
- `PublishJob`
- `RemotePublication`
- `Asset`, `AssetRendition`, `Tag`, `Folder`, `Template`
- `ApprovalRequest`, `ApprovalDecision`, `Comment`, `Assignment`

## Engagement

- `Contact`: workspace-local normalized identity; mergeable with provenance.
- `ContactIdentity`: provider-specific identity.
- `Conversation`: source, channel, contact, status, priority, assignee, SLA timestamps.
- `Message`: direction, remote ID, body, attachment references, author, timestamps.
- `InternalNote`, `SavedReply`, `ConversationEvent`.

## Paid and analytics

- `AdAccount`, `AdCampaign`, `AdSet`, `AdCreative`, `AudienceReference`.
- `MetricDefinition`: canonical name, source semantics, unit, aggregation rules.
- `MetricFact`: grain, source, entity, interval, value, currency, freshness, revision.
- `AttributionResult`: model, window, conversion source, confidence/provenance.
- `ReportDefinition`, `ReportRun`, `ExportArtifact`.

## Operations

- `Notification`, `AuditEvent`, `Subscription`, `UsageRecord`, `FeatureFlag`, `ImportJob`, `DeletionRequest`.

## Important relationships

- Organization 1—N workspaces; user N—N organizations/workspaces through memberships.
- Workspace 1—N channels, campaigns, content items, conversations, assets, and reports.
- Content item 1—N versions and variants; variant 1—N publish jobs and at most one active remote publication per destination/version.
- Campaign N—N content variants and paid campaigns through explicit join records.
- Conversation N—1 channel and usually N—1 contact; messages remain immutable except moderation/redaction metadata.

## Integrity rules

- Unique `(provider, remote_id, workspace_id)` for scoped remote objects.
- Publish jobs require an idempotency key unique to variant version and intended execution.
- Webhook receipts deduplicate by provider/event identifier and payload hash fallback.
- Approval decisions reference an immutable version.
- Money stores integer minor units plus ISO currency; never combine currencies without declared conversion source/time.
- Metric facts preserve provider and definition version; reprocessing writes a revision, not an invisible overwrite.
- Soft deletion is default for user work; secrets and regulated deletion follow dedicated erasure workflows.

## Storage strategy

Use a relational database for transactional state, object storage for media/exports, a queue for asynchronous work, cache for ephemeral acceleration, and an analytics store when volume requires it. Search indexes are derived and rebuildable. The system of record remains relational/object storage.

## Retention and privacy

Define retention by record class and plan. Provider tokens are encrypted and removed promptly on disconnect. User-facing deletion identifies remote content that cannot be erased by RocketEase. Contact data collection must be minimized, region-aware, exportable, and deletable subject to legal holds and audit obligations.

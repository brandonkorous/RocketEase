# Public API (v1)

**The trusted publishing layer under any AI agent.** Anything an agent can do here, a person could
do in the app — and every gate the app applies still applies: capability checks, the workspace's
approval policy, idempotency, and the audit log. Nothing publishes, spends, or replies without a
person.

Base URL: `{APP_URL}/api/v1` (locally `http://localhost:5001/api/v1`).
The MCP server in `packages/mcp` wraps exactly these endpoints.

## Authentication

```
Authorization: Bearer rke_…
```

Keys are created in **Settings → API keys** (capability `workspace.settings`) and shown once; only
their SHA-256 is stored. A key is:

- **scoped to one workspace** — it carries `organization_id` and `workspace_id`, and can never read
  or write another workspace;
- **bound to its creator** — every request re-reads that person's live membership. A demotion or a
  SCIM deprovision narrows or kills the key on the next request, with no revocation needed;
- **never wider than its creator** — requested scopes are intersected with the creator's own
  capabilities at creation time, and re-checked on every request. Deny wins twice.

Writes are audited as the creator (`content.create`, `approval.request`, `content.schedule`,
`conversation.reply_draft`, plus `api_key.create` / `api_key.revoke`).

### Scopes

Only the capabilities this API actually uses are on offer. `approvals.decide` is deliberately not
among them: an agent may ask for approval, never grant it.

| Scope | Unlocks |
| --- | --- |
| `content.create` | `POST /drafts` |
| `content.edit` | `POST /drafts/{id}/submit` (approval path) |
| `content.publish` | `POST /drafts/{id}/submit` (schedule path, when no policy applies) |
| `conversations.handle` | `GET /conversations`, `POST /conversations/{id}/reply-draft` |
| `analytics.view_scoped` | `GET /metrics` |

`GET /workspace`, `GET /channels` and `GET /items/{id}` need only a valid key.

## Errors

Every failure uses one envelope:

```json
{ "error": { "code": "forbidden", "message": "This key is not scoped for content.publish." } }
```

| Code | Status | When |
| --- | --- | --- |
| `unauthorized` | 401 | Missing, unknown, or revoked key |
| `forbidden` | 403 | Scope missing, capability lost, workspace archived |
| `not_found` | 404 | No such item or conversation in this workspace |
| `invalid_request` | 400 | Body or query failed validation |
| `conflict` | 409 | Impossible in the current state (already in review, validation error, disconnected channel) |
| `rate_limited` | 429 | 120 requests per key per minute; `Retry-After` in seconds |
| `internal` | 500 | Unexpected — nothing internal is leaked |

Rate limiting is per key, per process, in memory (`lib/reports/rate-limit.ts`). It is a courtesy
limit, not a security boundary; a multi-replica deployment needs a shared limiter.

## Idempotency

Send `Idempotency-Key: <your id>` on `POST /drafts` and `POST /conversations/{id}/reply-draft`. The
key is namespaced per API key and stored on the created row (`content_item.api_idempotency_key`,
`message.idempotency_key`), so a retry returns the original row with `"idempotentReplay": true`
instead of creating a second one.

`POST /drafts/{id}/submit` is idempotent by state: a second submit of a pending item is a `409`.

---

## `GET /workspace`

Who this key is, what it may do, and the gates that always apply.

```json
{
  "workspace": { "id": "ws_…", "name": "Acme", "timezone": "Europe/Prague", "organizationId": "org_…" },
  "key": { "name": "Claude Desktop — Ana", "scopes": ["content.create", "content.edit"] },
  "actor": { "userId": "u_…", "role": "manager", "grants": [] },
  "gates": { "publishing": "…", "approvals": "…", "replies": "…", "paidSpend": "…" }
}
```

## `GET /channels`

Connected accounts with their **live** capabilities (`?include=all` also lists disconnected ones).

```json
{ "channels": [ {
  "id": "ch_…", "name": "Acme on Instagram", "network": "instagram", "kind": "business",
  "status": "healthy", "health": { "tokenOk": true, "permissionsOk": true, "message": null },
  "capabilities": { "…": "the provider contract as stored" },
  "capabilitySummary": [ { "label": "First comment", "ok": true, "reason": null } ]
} ] }
```

An unsupported capability always carries the network's own reason — never a bare `false`.

## `POST /drafts`

Creates a draft post plus one variant per channel, and validates each against that channel's live
capabilities. **Nothing is published or scheduled.**

```json
{
  "title": "Spring launch",
  "text": "Doors open Monday.",
  "channelIds": ["ch_…"],
  "link": "https://example.com/spring",
  "assetIds": ["as_…"],
  "media": [{ "assetId": "as_…" }],
  "scheduledAt": "2026-09-01T09:00:00Z"
}
```

`assetIds` and `media` are interchangeable; assets must already be in the workspace library, ready
and scanned. `scheduledAt` records intent — it is applied when the post is submitted and approved.

`201`:

```json
{
  "item": { "id": "ci_…", "status": "draft", "approvalState": "not_required", "variants": [] },
  "validation": [ { "channelId": "ch_…", "blocking": true,
    "issues": [ { "severity": "error", "code": "asset_unscanned", "message": "…", "field": "media" } ] } ],
  "approval": { "required": true, "policy": "Client sign-off" },
  "next": "POST /api/v1/drafts/{id}/submit — a person approves and publishes."
}
```

## `POST /drafts/{id}/submit`

The human gate.

```json
{ "scheduledAt": "2026-09-01T09:00:00Z", "assigneeUserId": "u_…", "note": "Copy approved by legal." }
```

- **Approval path** (a policy matches, or the item is already in review): opens an approval request
  against a frozen version, notifies the approvers, and remembers `scheduledAt` so approval also
  schedules it. Needs `content.edit`.
  → `{ "status": "pending_approval", "requestId": "ar_…", "policy": "Client sign-off", "scheduleOnApprove": "…" }`
- **Schedule path** (no policy applies and `scheduledAt` is given): schedules exactly as the UI
  would — version snapshot, one publish job per variant, reconcile-before-retry semantics. Needs
  `content.publish`.
  → `{ "status": "scheduled", "scheduledAt": "…", "channels": 2 }`

Validation errors, a disconnected channel, a past time, or an item already in review return `409`
with the same wording the composer shows.

## `GET /items/{id}`

State plus the publish receipt per destination — what was validated, what was sent, what the
network confirmed, and whether an ambiguous response was reconciled before any retry.

```json
{
  "item": { "id": "ci_…", "status": "published", "variants": [] },
  "receipts": [ {
    "variantId": "pv_…", "channelName": "Acme on Instagram", "outcome": "confirmed",
    "headline": "Confirmed by Instagram · id 1789…",
    "summary": "Instagram's response was ambiguous, so we checked before retrying; no duplicate was sent.",
    "attempts": 2, "reconciled": true, "permalink": "https://…",
    "steps": [ { "key": "sent", "label": "Sent to Instagram", "tone": "done", "at": "…" } ]
  } ]
}
```

## `GET /conversations`

`?status=open|snoozed|resolved|all` (default `open`), `?tab=all|unread|mentions|dms|comments`,
`?channelId=`, `?assignee=me|unassigned|<userId>`, `?q=`, `?limit=` (≤100).

```json
{ "counts": { "all": 12, "unread": 3 },
  "conversations": [ { "id": "cv_…", "kind": "comment", "status": "open", "priority": "high",
    "preview": "Do you ship to Ireland?", "unread": 1, "overdue": true,
    "lastMessageAt": "2026-08-28T08:12:00.000Z",
    "contact": { "id": "co_…", "name": "Dana", "handle": "@dana" },
    "channel": { "id": "ch_…", "name": "Acme on Instagram", "network": "instagram" },
    "assignee": null } ] }
```

## `POST /conversations/{id}/reply-draft`

```json
{ "text": "We do — shipping to Ireland takes 3–4 days." }
```

Writes the reply as a `draft` outbound message. It appears in the Inbox thread with a **Send**
button; nothing is queued and no provider is called until a person presses it.

→ `201 { "messageId": "ms_…", "deliveryState": "draft", "note": "A person sends this from the Inbox." }`

Channel checks run first: a disconnected channel, a network that cannot reply, or text over the
channel's limit is a `409` with the inbox's own message.

## `GET /metrics`

`?metric=reach,engagement,conversions` (default: the scorecard), `?from=&to=` (YYYY-MM-DD in the
workspace timezone; default the last 28 full days), `?scope=all|organic|paid`, `?channelId=`,
`?campaignId=`.

```json
{
  "timezone": "Europe/Prague", "scope": "all",
  "definitionsVersion": "2026.08.2",
  "period": { "from": "2026-07-31", "to": "2026-08-27" },
  "freshAt": "2026-08-28T03:10:00.000Z",
  "stale": [ { "name": "Acme on TikTok", "network": "tiktok", "reason": "token expired" } ],
  "values": [
    { "metric": "reach", "name": "Reach", "value": 18420, "formatted": "18.4K", "unit": "count",
      "definition": "Accounts that saw your content at least once, per network.",
      "formula": "Σ per-network daily reach",
      "sources": ["insights API — retiring: …"],
      "caveat": "Reach is unique within a network and a day only. …",
      "definitionChanges": ["Reach (Meta), 2026-06-15: Post and Page reach (unique impressions) → …"],
      "unavailable": null },
    { "metric": "roas", "value": null, "formatted": "—",
      "unavailable": "No paid spend in this period, so there is nothing to divide revenue by. …" }
  ]
}
```

**Missing is never zero.** When `unavailable` is set, `value` is `null` and the string says exactly
what is missing and where to fix it. A `definitionChanges` entry means the series is not continuous
across that date — do not stitch or compare across it.

---

## What this API deliberately does not do

- **Publish on demand.** There is no "publish now" endpoint. Scheduling exists only where the
  workspace's own policy would let that person schedule, and it goes through the same version
  snapshot, validation and reconcile-before-retry path as the UI.
- **Decide approvals.** `approvals.decide` is not a grantable scope.
- **Send replies.** Replies are drafted; the Inbox sends them.
- **Spend money.** No paid endpoints. Paid spend additionally requires step-up re-authentication,
  which a key cannot satisfy.
- **Manage channels, members, or billing.** Connecting accounts and changing roles stay in the app.

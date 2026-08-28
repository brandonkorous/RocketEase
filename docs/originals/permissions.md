# Permissions

## Authorization model

Use organization membership plus workspace membership. Every server-side query and mutation is scoped by tenant and workspace; client-side hiding is never authorization. Provider tokens are accessed through a dedicated secret boundary.

## Roles

| Capability | Owner | Admin | Manager | Creator | Responder | Analyst | Client approver | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Organization billing/delete | Yes | No | No | No | No | No | No | No |
| Workspace settings/members | Yes | Yes | Limited | No | No | No | No | No |
| Connect/disconnect channels | Yes | Yes | If granted | No | No | No | No | No |
| Create/edit content | Yes | Yes | Yes | Yes | No | No | Comment | No |
| Schedule/publish | Yes | Yes | Yes | Policy-based | No | No | No | No |
| Approve/reject content | Yes | Yes | Yes | No | No | No | Assigned only | No |
| Handle conversations | Yes | Yes | Yes | If granted | Yes | No | No | No |
| Manage campaigns/ads | Yes | Yes | Yes | Draft only | No | Analyze | No | No |
| View analytics | Yes | Yes | Yes | Scoped | Scoped | Yes | Scoped | Yes |
| Export reports | Yes | Yes | Yes | If granted | If granted | Yes | If granted | If granted |
| View audit log | Yes | Yes | If granted | No | No | No | No | No |

Roles are presets. Enterprise/custom plans may add explicit grants, but deny wins over allow and the resulting permissions must be inspectable.

## Approval policy

Workspace policy determines which content requires approval by channel, campaign, author role, paid spend, or risk label. The author cannot satisfy a separation-of-duty rule when one is configured. Any material edit after approval—copy, asset, destination, time, targeting, budget, tracking—invalidates affected approvals and creates a new version.

Approval decisions are immutable events. The current state is derived and displayed with approver, timestamp, version, reason, and due date. “Request changes” requires a comment. Bulk approval lists every affected item and skips unauthorized or stale versions.

## High-risk actions

Require reauthentication or strong confirmation for ownership transfer, organization deletion, broad token revocation, security changes, large budget increases, and bulk publish/delete. Show exact workspace, channels, audience, amount, timing, and reversibility.

## Agency safety

- No cross-workspace assets, audiences, conversations, or channels unless deliberately shared at organization scope.
- The active workspace name and identity appear in composer, approval, publishing, and ad-spend confirmation.
- Client approvers receive object-level links and cannot browse unrelated client data.
- Shared templates are copied or referenced with explicit provenance; client-private assets never become organization-wide automatically.

## Audit requirements

Record actor, effective user, organization, workspace, action, target, before/after summary, request ID, IP/device metadata where lawful, timestamp, and result. Include login, membership, permission, token, connection, publish, approval, report export, data export/deletion, and ad-budget events. Audit records are append-only with restricted access and documented retention.

## Service accounts and automation

Use narrowly scoped service identities, expiring credentials, rate limits, and named owners. Automated actions must identify the rule and triggering event. Human override and kill switches are required for publishing, replies, and spend.

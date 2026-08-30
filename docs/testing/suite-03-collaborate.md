# Suite 03 — Approvals, inbox, collaboration

## L. Approvals

| ID | Test | Expected | |
|---|---|---|---|
| L-01 | Create an approval policy (Settings → Team and roles) | Matches by channel / campaign / author role / spend / risk label | ☐ |
| L-02 | Compose a post that matches the policy | "Request approval" replaces the publish action | ☐ |
| L-03 | Approvals queue renders (`approvals.png`) | Status / due / assignee filters work | ☐ |
| L-04 | Preview + diff on a request | Diff is accurate against the previous version | ☐ |
| L-05 | Approve → schedule → publish | Full chain works | ☐ |
| L-06 | Request changes | Comment is **required**; author sees the warning banner | ☐ |
| L-07 | Reject | Terminal state, clear next step | ☐ |
| L-08 | Edit an approved post | Approval is **superseded**; cannot publish on a stale approval | ☐ |
| L-09 | Bulk approve including a stale item | Stale/unauthorized items are **skipped**, and it says which | ☐ |
| L-10 | Separation of duty | Author cannot approve their own when the policy forbids it | ☐ |
| L-11 | Client approver | Object-level link only; no browsing; decides only when assigned | ☐ |
| L-12 | Decisions are immutable | No edit/delete path; visible in the audit log | ☐ |
| L-13 | Comments and assignment on an item | Work. Field/asset-anchored comments are **not built** (3.4 partial) — do not file | ☐ |

## M. Inbox

Ingestion is a 2-minute poll plus webhooks (W6). Mock is not available in production (W7), so
round-1 inbox coverage depends on real Facebook comments and messages.

| ID | Test | Expected | |
|---|---|---|---|
| M-01 | Comment on a published Facebook post from another account | Appears in the inbox within the tick | ☐ |
| M-02 | Send the Page a message | Appears as a conversation | ☐ |
| M-03 | Three-pane layout (queue / thread / context) | Renders; context pane shows the contact and history | ☐ |
| M-04 | Filters: unread, assignment, status, priority | Work and combine | ☐ |
| M-05 | Reply to a comment | Delivered; visible on Facebook; state reaches `sent` | ☐ |
| M-06 | Reply to a DM | Same | ☐ |
| M-07 | **Ambiguous reply reconciliation (ENG-003)** | Reconciles via `findReply` before any resend. **No double reply** — P0 | ☐ |
| M-08 | Internal note | Not sent to the contact. Verify on Facebook | ☐ |
| M-09 | Snooze, resolve, escalate | State changes stick; conversation events recorded | ☐ |
| M-10 | Saved replies (Settings → Inbox) | Insert correctly | ☐ |
| M-11 | Response target / SLA timestamps | Present and meaningful | ☐ |
| M-12 | Duplicate webhook delivery | Idempotent on channel + remoteId — one conversation, not two | ☐ |
| M-13 | Mobile drill-in at 375px | Usable | ☐ |
| M-14 | Review kind (GBP, M8.10) | Human-only reply gate holds. GBP likely unavailable (W7) | ☐ |

## N. Notifications

**2.9 is partially built** — table, worker writes and failure email exist; the in-app centre is
pending. Judge what is there; do not file the known gap.

| ID | Test | Expected | |
|---|---|---|---|
| N-01 | Cause a publish failure | Email arrives (W12 — real send) | ☐ |
| N-02 | `/app/:id/notifications` | Renders whatever exists without erroring | ☐ |
| N-03 | Settings → Notifications | Preferences save and are honoured | ☐ |
| N-04 | Notification content | Names the post and the reason; links to the fix | ☐ |

## O. Team

| ID | Test | Expected | |
|---|---|---|---|
| O-01 | Team page: members, invitations, roles | All render; covered further in suite 01 §D | ☐ |
| O-02 | Explicit grants beyond the role preset | Take effect; audited | ☐ |
| O-03 | Remove a member with assigned work | Assignments handled, not orphaned silently | ☐ |

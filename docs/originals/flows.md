# Product flows

## Create, approve, and publish

1. User starts from Create, Calendar, Campaign, Library, or duplicate/reuse.
2. Select destinations; capabilities load per channel.
3. Add shared content and media; create channel overrides as needed.
4. Validation reports blocking errors and recommendations by destination.
5. Autosave creates versions. User previews every variant.
6. User publishes now, schedules, or requests approval.
7. Approval policy routes reviewers and due dates; edits may supersede approval.
8. Scheduler revalidates and queues idempotent provider jobs.
9. Variant-level results update the parent. Partial success offers retry only for failed destinations.
10. Remote reconciliation confirms publication and begins analytics ingestion.

## Unified inbox

1. Webhook/polling ingests an item and deduplicates it.
2. Rules classify channel/type and optional priority; default queue remains transparent.
3. Agent claims or is assigned the conversation.
4. Conversation view shows messages; context panel shows allowed history and campaign/customer data.
5. Agent replies, uses a saved reply, adds an internal note, or escalates.
6. Provider outcome is confirmed; uncertain sends are reconciled before retry.
7. Agent resolves, snoozes, or leaves open. All state changes enter history.

## Campaign creation and promotion

1. Define campaign name, objective, dates, owner, and optional budget/target.
2. Attach or create organic content.
3. After publication, eligible variants can become promotion candidates.
4. User selects ad account, audience, creative, placements, budget, and dates only where supported.
5. Preview summarizes source post, destination, spend, tracking, and approval requirements.
6. Approved action creates or links remote paid objects.
7. Campaign detail combines content, ads, audience, spend, engagement, conversions, conversations, and performance history.
8. Recommendations are explainable suggestions; spend changes always require policy-compliant confirmation.

## Reporting

1. Select workspace/campaign, date range, comparison, channels, and paid/organic scope.
2. View source freshness and metric definitions.
3. Drill from scorecard to channel, content, ad, or conversation detail.
4. Save report definition or export current view.
5. Optional schedule validates recipients and permissions at each run.
6. Generated artifact records filters, timezone, currency, definitions, and freshness.

## Connect or repair an account

1. Start in onboarding or Connected Accounts.
2. Review requested access and continue to provider authorization.
3. Select returned channels/ad accounts and assign them to the explicit workspace.
4. Initial sync runs; health and available capabilities appear.
5. On expiry/scope loss, affected actions stop and the owner/admin receives a reconnect task.
6. Reconnect restores the same logical channel when identity matches; disconnect explains impact and revokes/removes credentials.

## Agency multi-client work

1. Agency overview displays per-client approvals, failed posts, inbox backlog, upcoming content, connection alerts, and directional performance.
2. User selects a workspace; header and shell adopt that client identity while RocketEase styling remains constant.
3. All create/reply/spend actions show the active workspace and destination.
4. Switching with unsaved work requires save/discard/cancel.
5. Cross-workspace reports are view-only aggregates unless the user enters a workspace to mutate data.

## Mobile quick compose

1. Tap central Create action.
2. Capture/upload media, enter shared copy, and choose channels.
3. Address compact platform validation and preview variants.
4. Choose publish now, schedule, or send for approval.
5. Receive clear queued/result state; failures remain in Home attention queue with recoverable drafts.

## Destructive and bulk actions

Selection displays count and scope. Confirmation identifies workspace, destinations, timing, and irreversible effects. Server rechecks permission and object version. Partial bulk outcomes return per-item results and a downloadable error list when large.

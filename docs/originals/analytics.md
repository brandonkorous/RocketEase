# Analytics and reporting

## Purpose

Analytics should answer: what happened, why it matters, and what to do next—without erasing differences between networks. Paid and organic results share campaign context but retain source-specific definitions.

## Reporting dimensions

Date and comparison period, workspace, campaign, channel, network, content item/variant, paid versus organic, format, audience segment where permitted, team owner, and tags. Filters are shareable and included in exports.

## Canonical metrics

- Output: published posts, publishing success, response volume.
- Awareness: impressions, reach, video views with provider-qualified thresholds.
- Engagement: reactions, comments, shares, saves, replies; rate denominator is explicit.
- Traffic: link clicks, sessions where connected, click-through rate.
- Audience: followers, net growth, demographics where available and lawful.
- Service: first response time, resolution time, backlog, SLA attainment.
- Paid: spend, CPM, CPC, CTR, conversions, CPA, revenue, ROAS.
- Workflow: time to approval, revision count, overdue items, content reuse.

Never sum unique reach or followers across platforms as if identities were deduplicated. Do not compare view counts without exposing provider definitions.

## Metric contract

Every displayed metric has name, plain-language definition, formula, unit, valid grains, provider mappings, timezone behavior, freshness expectation, null behavior, and definition version. Tooltips link to the contract. Missing is not zero.

## Date comparison

Default comparison is previous equal-length period in the workspace timezone. Users can choose previous period, previous year, or custom. Show both absolute and percentage change; handle zero denominators as “new” or unavailable, not infinity. Partial current periods compare with equivalent elapsed time and are labeled partial.

## Campaign attribution

Campaign detail joins organic posts, promoted posts, paid campaigns, tracking links, spend, conversions, and conversation activity. MVP supports deterministic campaign tagging and imported provider attribution. Later models may add first/last touch and configurable windows. Always show attribution model, window, source, currency conversion, and data freshness.

## Reports

Users can save filters, columns, charts, comparison, timezone, recipients, cadence, and format. Exports include generation time, filters, definitions/version, source freshness, and workspace identity. Scheduled delivery requires permission checks at run time and records recipients and artifacts.

## Product analytics telemetry

Track privacy-conscious events such as workspace_created, channel_connected, draft_created, approval_requested/decided, post_scheduled/published/failed, conversation_replied/resolved, campaign_created, report_saved/exported, and onboarding_step_completed. Events contain opaque user/workspace IDs, source surface, outcome, latency, and schema version; never capture message bodies, post text, tokens, or unnecessary personal data.

## Data quality

Show last updated and degraded sources. Run checks for freshness, duplicate facts, currency mismatch, negative/implausible values, remote revisions, and aggregate reconciliation. Backfills and corrections create revisions and a visible note when a report materially changes.

## Initial dashboards

- Home: attention plus concise performance pulse.
- Analytics overview: scorecard, trend, channel mix, paid/organic split, top content.
- Content: format and post performance with reusable winners.
- Engagement: volume, response, resolution, sentiment only if explainable.
- Campaign: objective, content, ads, spend, engagement, conversions, history.
- Agency overview: per-workspace health and directional metrics, never misleading combined currency totals.

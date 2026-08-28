# Roadmap

The roadmap is outcome-based. Dates follow staffing, provider access, and validated technical spikes; do not promise unsupported platform capability.

## Phase 0 — Foundations

Outcome: a secure, testable product skeleton.

- Confirm target personas, launch networks, API/app-review feasibility, and billing assumptions.
- Establish organization/workspace tenancy, roles, audit, design system, accessible shell, environments, CI, observability, and ADR practice.
- Build provider adapter contract, OAuth prototype, media pipeline spike, publish idempotency/reconciliation spike, and metric dictionary.

Gate: tenant isolation and a sandbox post can be demonstrated end to end.

## Phase 1 — Plan and publish MVP

Outcome: an activated workspace can reliably schedule cross-channel content.

- Onboarding, connected accounts, content library, composer/variants, calendar, drafts/versions, basic approvals, schedule/publish, status/failure recovery, notifications, mobile quick compose.
- Launch providers selected from Meta, LinkedIn, and TikTok based on actual approval.

Gate: beta publish reliability and activation targets meet agreed thresholds; duplicate-publish controls are proven.

## Phase 2 — Engage and collaborate

Outcome: teams can manage supported inbound social work with ownership and context.

- Unified inbox, assignment, status, notes, saved replies, response metrics, approval queue refinement, client approver links, agency overview, connection health operations.

Gate: reply delivery/reconciliation is reliable and agency isolation testing passes.

## Phase 3 — Understand

Outcome: teams can explain cross-channel content and campaign performance.

- Analytics overview, content/channel/campaign reports, date comparison, paid/organic split, provider metric definitions, CSV export, saved/scheduled reports, data-quality operations.

Gate: provider totals reconcile within documented rules and every metric has a published contract.

## Phase 4 — Promote

Outcome: users connect organic winners to paid promotion safely.

- Ad account import, campaign detail, promoted-post lineage, audience references, spend/conversion reporting, then controlled ad creation for supported providers.
- Budget permissions, confirmations, caps, audit, and incident controls precede mutation.

Gate: spend-changing workflows pass finance/security review and provider certification.

## Phase 5 — Improve and expand

Outcome: the system helps teams repeat what works.

- Explainable recommendations, best-time analysis, content reuse, automation rules with approval gates, additional providers, analytics/commerce/CRM connections, enterprise SSO/SCIM, advanced agency reporting and branding.

## Continuous tracks

Accessibility, privacy, abuse prevention, performance, support tooling, connector maintenance, mobile quality, metric governance, design-system consistency, and customer research continue in every phase.

## Prioritization rules

Prioritize work that completes a lifecycle loop, reduces trust risk, or removes repeated customer effort. Defer breadth that creates shallow provider parity, features requiring manual reconciliation, or automation without clear human control.

## Key decisions to validate

- Exact launch provider capabilities and review timelines
- Whether inbox support is launch-critical for every provider or capability-based
- Initial plan limits and cost-to-serve
- Ad management depth versus import/deep-link
- Attribution sources and supported conversion integrations
- Native mobile application timing versus responsive/PWA experience
- Data residency, regulated-industry, and enterprise requirements

# Make It Social — Capability Inventory (as built, 2026-08-28)

Audited against `docs/originals/*`, `apps/platform`, `packages/providers`. **Headline caveat:** the whole product is verified end-to-end only against the in-repo **mock provider** (`packages/providers/src/mock/`). Every real adapter is written but has never run against a live API — no credentials exist.

## 1. Feature inventory by area

**Plan/Calendar & Create — built.** Composer (`apps/platform/components/composer/`: shared text + per-channel overrides, media picker, live per-network previews, first comment, link/UTM, autosave → immutable `content_version`, best-time hints), mobile quick-compose (`components/composer/quick`), calendar month/week/list with drag-reschedule, templates with lineage (`lib/actions/templates.ts`), bulk *reschedule* (`lib/actions/content/bulk.ts` — shift-by-offset; **not** CSV import). Validation is capability-derived and versioned (`packages/providers/src/validate.ts`).

**Publish — built, strongest area.** `worker/handlers/publish.ts` claims the job, re-validates token/capability/version/approval/asset-rights, publishes with a per-variant `idempotencyKey`, and on an ambiguous provider error calls `adapter.findPublication` **before any retry**. Queue policy enforces it: `"publish.execute": { policy: "stately", retryLimit: 0 }` in `lib/jobs/queues.ts` — the worker, not pg-boss, decides retries. Nightly `publication.reconcile` + `connection.refresh`.

**Engage/Inbox — built.** Four kinds (`comment | mention | message | review`, `db/schema/engagement.ts`), three-pane UI, assignment/status/priority/SLA, notes, snooze, saved replies, contacts. Ingestion: webhook (`/api/webhooks/[provider]` → `webhook_receipt` → `webhook.process`) + `inbox.sync` polling; replies are queued `message` rows reconciled via `findReply`. Reviews are ingested from Google Business Profile (M8.10); Meta now declares `reviews: false` with a reason (fixed 2026-08-28).

**Campaigns/Paid — built (mock-verified).** `campaign`/`campaignContent`/`adAccount`/`adCampaign`/`adSet`/`adCreative`/`promotion`, read-only ads import (`worker/handlers/ads-sync.ts`), campaign detail tabs, promote-a-post with currency match, remaining-budget check, explicit confirmation, **step-up re-auth before spend** (`lib/actions/campaigns/promote.ts`). Only Meta + mock have ads adapters.

**Analytics/Reports — built.** 24-metric contract registry (formula/unit/grains/provider-mapping/freshness/caveats, `DEFINITIONS_VERSION`; `lib/analytics/metrics.ts`); `metric_fact` grain store with revisions; overview/content/engagement tabs; CSV export stamped with filters+definitions+freshness; saved + scheduled reports with run-time recipient permission checks; nightly `quality.check` → `data_quality_issue`; privacy-safe `product_event` telemetry.

**Automations/Recommendations — built.** Rules engine (`lib/automations/`) with triggers, conditions, 11 action kinds each mapped to a capability; rules re-load the *creator's* live role every run (demotion disables). Hard human gates: pausing ads and answering reviews always need a person. Recommendations are rule-based and explainable (`lib/recommendations/rules/`: cadence, format-performance, trend, reuse, audience-growth, inbox-load) + best-time slots. Zero ML/LLM.

**Collaboration/Approvals — built.** Policy matcher (channel/campaign/author-role/paid-spend/risk), immutable `approval_decision`, superseded-on-edit, queue with diff + bulk-with-stale-skip, field/asset-anchored comments, client-approver role with object-scoped links.

**Tenancy/Agency/Permissions — built.** Org → Workspace → Channel; 8 roles / 19 capabilities (`lib/authz.ts`), `requireWorkspace`/`requireCapability` everywhere, append-only `audit_event`, agency overview + per-client roll-up + white-label branding, Playwright tenant-isolation suite.

**Integrations/Providers — 7 adapters, 1 exercised.** mock (verified) · meta, linkedin, tiktok, youtube, pinterest, x (**all untested live**). Capabilities are per-channel with `reasons` strings (`packages/providers/src/types.ts`). `packages/providers/README.md` documents what each API cannot do (LinkedIn: no DMs/webhooks, partner-gated; Pinterest: no comments/messaging/webhooks/revoke; X free tier: no mentions timeline; YouTube 10k/day ≈ 6 uploads).

**Security/Enterprise — built, no live IdP.** TOTP 2FA + backup codes, session list/revoke, AES-256-GCM token envelopes bound to row id with key rotation (`lib/crypto.ts`), step-up re-auth (5-min window; password/TOTP/SSO), SSO via `@better-auth/sso` (OIDC/SAML per org, domain enforcement, owner break-glass), SCIM 2.0 Users/Groups. Known limit: SAML `ForceAuthn` not exposable → SAML step-up records `forced: false`.

**Tracking/Conversions — built; 2 of 3 sources untested live.** GA4 and Shopify code-complete but unexercised; signed generic webhook works end to end. Double-count rule enforced: paid `utm_medium` → ad platform, everything else → tracking source; ROAS = paid-medium revenue ÷ spend. `lib/tracking/availability.ts` owns every "why unavailable" string; a missing metric never renders as 0.

## 2. Architectural strengths that could be differentiators

1. Reconcile-before-retry publishing, enforced by queue policy.
2. Per-channel capability model with reasons — no false parity claims.
3. Metric contract registry with version stamp carried into exports/shared reports.
4. Transactional outbox (`lib/jobs/outbox.ts`).
5. Automations bounded by creator's live permissions, non-overridable human gates on spend and public reviews.
6. Conversion attribution that refuses to double-count; "missing is not zero" as a first-class state.
7. White-label client reporting: branded HTML, signed expiring revocable `/r/:token` links, passcode, rate limit, audited views, double-opt-in recipients.
8. Immutable audit/version/approval-decision trails.

## 3. Gaps vs. a typical social suite

| Capability | Status | Evidence |
|---|---|---|
| AI content generation / caption assist | Absent | no LLM dependency anywhere |
| Social listening / brand monitoring | Absent | inbox covers owned mentions only |
| Competitor benchmarking | Absent | only self-comparison in cadence rule |
| Link-in-bio | Absent | — |
| Employee advocacy | Absent | — |
| Review management | Present (Google Business Profile) | `google_business` adapter: v4 reviews list/reply → inbox `review` kind, polling only, human-only reply gate. Meta declares `reviews: false` with a reason; no Trustpilot/Yelp |
| Media library / DAM | Present | `asset`, renditions, tags, folders, presigned upload, sharp, ClamAV hook; folder UI is a rail; video probing deferred |
| UGC rights management | Present | `rightsNote` + `rightsExpiresAt`; publish blocked on expiry |
| First comment | Present | composer → publish → adapter flag |
| Hashtag manager / saved sets | Absent | only `hashtagsMax` validation |
| Evergreen recycling / requeue | Absent | reuse exists only as a recommendation |
| Bulk CSV import of posts | Absent | CSV export only |
| Native mobile app / PWA | Absent | responsive + bottom nav only; no manifest/SW |
| Browser extension | Absent | — |
| Sentiment analysis | Absent | analytics.md gates it on explainability |
| Ad creation depth | Partial | boost-a-post only, Meta only |

## 4. Documented promises vs. code

- product.md "connected operating model: content → post, winning post → ad, responses retain context, performance returns to planning" — **delivered** in all four legs.
- product.md "Safe publishing … defaults" — **delivered**.
- product.md "Purpose-built mobile dashboard, inbox, calendar, and composer" — **partial** (quick-compose + responsive; no app/PWA).
- analytics.md "Every displayed metric has name, definition, formula… Missing is not zero." — **delivered**.
- analytics.md "Never sum unique reach or followers across platforms" — **delivered** as caveats.
- roadmap Phase 4 gate "finance/security review and provider certification" — **not met** (no external review).
- integrations.md "confirm capabilities during implementation" — **unmet for all six real networks**; Meta `reviews: true` is the concrete over-declaration.

**Bottom line:** unusually deep on trust mechanics; unusually thin on the growth/creative surface every incumbent ships. Correctness proven against mock only.

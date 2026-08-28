# Make It Social — Implementation Plan

**Status:** living document. Sequenced from `docs/originals/roadmap.md` and the P0/P1 IDs in `docs/originals/requirements.md`. Update this file when scope or order changes; it is the source of truth for "what's next".

Each milestone is a shippable increment with an exit gate. Order inside a milestone is the recommended build order — later items depend on earlier ones.

Legend: ✅ done · 🔨 in progress · ⬜ not started · `REQ-ID` traces to requirements.md

---

## Milestone 0 — Foundations (Phase 0) — ✅ done (OTel export + Playwright/isolation suite still open)

| # | Feature | Reqs | Status |
|---|---|---|---|
| 0.1 | Monorepo, Silica UI theme, landing page | — | ✅ |
| 0.2 | Postgres (Docker/Azure) + Drizzle migrations | — | ✅ |
| 0.3 | Better Auth email/password + organization plugin | TEN-001 | ✅ |
| 0.4 | Workspace, workspace_membership (8 roles), audit_event | TEN-001, TEN-004 | ✅ |
| 0.5 | Server-enforced tenant gate (`requireWorkspace`) | TEN-002 | ✅ |
| 0.6 | Onboarding: org → workspace; add-workspace | ONB-001 (partial) | ✅ |
| 0.7 | App shell, route map, designed empty states, agency overview | TEN-003 (read-only) | ✅ |
| 0.8 | Containers (Dockerfile per app) | — | ✅ |
| 0.9 | **Authorization helper**: `can()` / `requireCapability()` from the role matrix + grants (`lib/authz.ts`, tested) | TEN-002 | ✅ |
| 0.10 | Email delivery via SMTP (`lib/mail.ts`, Mailpit locally), queued through the outbox; verification + reset wired into Better Auth | ONB-001 | ✅ |
| 0.11 | Invitations (`workspace_invitation`) → `/invite/:token` accept → org member + workspace membership; Team page (invite, role change, remove) | TEN-001 | ✅ |
| 0.12 | Security: TOTP 2FA + backup codes, login 2FA step, password change, session list/revoke. Reauth gate for high-risk actions lands with the first such action (M6.5) | NFR-001 | ✅ |
| 0.13 | pg-boss queue registry (`lib/jobs/queues.ts`), transactional outbox + relay, worker (`worker/index.ts`, `Dockerfile.worker`) | NFR-003 | ✅ |
| 0.14 | Observability: request IDs (middleware), structured JSON logs (`lib/log.ts`), `/api/health`. OpenTelemetry export deferred until the sparx collector endpoint is known | NFR-008 | 🔨 |
| 0.15 | Vitest harness (authz matrix tested). Playwright e2e + DB-level tenant-isolation suite still to add | release gate | 🔨 |
| 0.16 | CI (`.github/workflows/ci.yml`: typecheck, tests, migration drift check, build, images) + Kustomize manifests (`deploy/k8s`) | — | ✅ |

**Gate:** tenant isolation tests pass; a sandbox post can be published end-to-end (needs M1.1–1.6 — so the roadmap's Phase 0 gate actually closes at the end of M1).

Notes
- 0.9 unblocks every later mutation; do it first.
- 0.13 is the backbone of publishing, ingestion, and reports. Choose `pg-boss` (Postgres-native, no Redis) unless the sparx cluster already runs Redis we should reuse.

---

## Milestone 1 — Connect & Content (first half of Phase 1) — ✅ done (mock provider verified end-to-end; real providers need credentials)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 1.1 | ✅ **Provider adapter contract** (`packages/providers`): auth, refresh, revoke, listChannels, describeChannel, validate, publish, findPublication (reconciliation), publicationStatus, webhooks. Inbox/insights/ads surfaces added in M4–M6 | INT-002 | — |
| 1.2 | ✅ `provider_connection`, `channel`, `sync_cursor`, `webhook_receipt`, `oauth_state` | INT-001..003 | — |
| 1.3 | ✅ AES-256-GCM envelopes bound to row id (`lib/crypto.ts`), key rotation via keyId; master key from env/Key Vault | NFR-001 | — |
| 1.4 | ✅ OAuth flow: single-use state row, callback, explicit channel selection page, reconnect preserves ids, cancel path | INT-001 | 1.1–1.3, 0.9 |
| 1.5 | ✅ Connected accounts UI + `channel.sync` worker (health states, capabilities, check now, disconnect with impact + remote revoke) | INT-002 | 1.4 |
| 1.6 | ✅ (code, untested live) **Meta adapter**: Graph v21 auth + long-lived token, Pages + IG business, publish text/image/carousel/video/reel/story, reconciliation scan, webhooks verify/parse. Needs Meta app credentials to exercise | INT-001 | 1.1 |
| 1.7 | ✅ (code, untested live) LinkedIn adapter (Posts API, org pages + member, image/multi-image/video/article) | INT-001 | 1.1 |
| 1.8 | ✅ (code, untested live) TikTok adapter (Content Posting API direct post, video + photo) | INT-001 | 1.1 |
| 1.9 | ✅ Library backend: `asset`/`asset_rendition`/`tag`/`folder`, direct-to-storage presigned uploads (MinIO local / S3 API), `asset.process` worker (checksum, sharp renditions, ClamAV hook). Video probing/poster frames deferred to the media pipeline | LIB-001, LIB-002 | 0.13 |
| 1.10 | ✅ Library UI: grid, drag-drop + progress, search/type/tag filters, detail drawer (alt text, caption, tags, rights/expiry), soft delete (usage guard wired to variants in M2). Folders UI deferred | LIB-001 | 1.9 |
| 1.11 | ✅ Provider flags by configuration + `lib/flags.ts` dotted-key kill switches (`FEATURE_FLAGS=off:meta.publish.reel`) | integrations.md | — |

**Gate:** owner connects a real Meta sandbox page, sees capabilities + health; assets upload and render.

---

## Milestone 2 — Compose, Schedule, Publish (second half of Phase 1) → **MVP publish loop**

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 2.1 | ✅ Content model tables: `content_item`, `content_version` (immutable), `post_variant`, `template`, state machines from content-model.md | PUB-001, PUB-002 | 1.9 |
| 2.2 | ✅ Validation engine: per-channel rules from capabilities, versioned ruleset, blocking vs recommendation | PUB-004 | 1.1 |
| 2.3 | ✅ **Composer** ("Create", matches create-post.png): shared text + per-channel overrides, media ordering, alt text, first comment, link/UTM, autosave → versions, live previews per network | PUB-001 | 2.1, 2.2 |
| 2.4 | ✅ Scheduling: publish now / schedule in workspace timezone, `publish_job`, `remote_publication` | PUB-003 | 0.13 |
| 2.5 | ✅ Publish worker (verified with mock provider): pre-flight revalidation (token, capability, version, approval, asset rights), idempotency keys, ambiguous-timeout → **reconciliation before retry**, per-variant results, partial-success retry | PUB-004, PUB-005, NFR-003 | 2.4, 1.6 |
| 2.6 | ✅ Calendar (week/month/list, drag-reschedule with confirm, matches planner.png): month/week/list, filters (channel/campaign/status/assignee), drag-reschedule with confirmation, post preview cards | PUB-003 | 2.1 |
| 2.7 | ✅ Post detail page: variants, validation, versions/activity, retry failed destinations | PUB-005 | 2.3 |
| 2.8 | ✅ Home (matches overview mockup) with real attention queue: failed posts, disconnected channels, upcoming | — | 2.5 |
| 2.9 | 🔨 Notifications: table + worker writes + email on publish failure done; in-app center UI pending: in-app center + email for publish failures; preference model | COL-003 | 0.10 |
| 2.10 | 🔨 Mobile: composer is responsive; dedicated linear quick-compose pending (linear flow) | flows.md | 2.3 |
| 2.11 | 🔨 Onboarding: Home 5-step checklist driven by real state; goals step pending: goals step, connect step, invite step, first-post step; checklist driven by domain events | ONB-001 | 1.4, 2.4, 0.11 |
| 2.12 | Templates + reuse with lineage; bulk reschedule | PUB-006 (P1) | 2.6 |

**Gate (roadmap Phase 1):** create → schedule → publish passes e2e on Meta + LinkedIn sandboxes; duplicate-publish tests (retry, ambiguous timeout, replay) pass; activation path measurable.

---

## Milestone 3 — Approvals & Collaboration (Phase 2, part A) — ✅ done (field/asset-anchored comments pending)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 3.1 | ✅ Approval policy model (`approval_policy`, matchPolicy, editor in Settings → Team and roles): by channel / campaign / author role / paid spend / risk label; separation-of-duty | COL-001 | 0.9, 2.1 |
| 3.2 | ✅ `approval_request`, `approval_decision` (immutable events), superseded-on-edit | COL-002 | 2.1 |
| 3.3 | ✅ Approvals queue UI (matches approvals.png; bulk approve skips stale/unauthorized): status/due/assignee filters, preview + diff, approve / request changes (comment required) / reject, bulk with stale-version skip | COL-002 | 3.2 |
| 3.4 | 🔨 Comments (item/version) + assignment done; due dates on requests; field/asset-anchored comments pending (item/version/field/asset region), assignments, due dates, activity history | COL-003 | 2.1 |
| 3.5 | ✅ Composer integration: "Request approval", approval state in calendar/post detail | COL-001 | 3.2, 2.3 |
| 3.6 | ✅ Client approver role (sees only assigned requests; decides only when assigned): object-level links, narrow view, no browsing | COL-004 (P1) | 3.3, 0.11 |
| 3.7 | ✅ Team page (built in M0.11): members, invitations, role changes (audited), explicit grants | ADM-001 | 0.11 |

**Gate:** create → approve → schedule → publish e2e passes; approval decisions are immutable and auditable.

---

## Milestone 4 — Unified Inbox (Phase 2, part B) — ✅ core done (verified with mock provider: webhook → worker → thread → reply → reconcile)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 4.1 | ✅ Ingestion pipeline: webhook endpoints (signature verify, fast ack, dedupe via `webhook_receipt`), polling/backfill with cursors, worker processing | INT-003, ENG-001 | 0.13, 1.2 |
| 4.2 | ✅ Engagement tables: `contact`, `contact_identity`, `conversation`, `message`, `internal_note`, `saved_reply`, `conversation_event` | ENG-001 | — |
| 4.3 | 🔨 Mock + Meta inbox adapters done (untested live); LinkedIn/TikTok inbox pending (LinkedIn comments API is partner-gated) | ENG-001 | 1.6, 1.7 |
| 4.4 | ✅ Inbox UI: three-pane (queue / thread / context), filters, unread, assignment, status, priority, SLA timestamps; mobile drill-in | ENG-002 | 4.2 |
| 4.5 | ✅ Reply with provider delivery state; **ambiguous-send reconciliation** before retry | ENG-002, ENG-003 | 4.3 |
| 4.6 | 🔨 Notes, snooze, resolve, escalate (priority), saved replies done; response target is a per-workspace default (settings UI pending); snooze/tag/note inputs use browser prompts (replace with popovers) | ENG-002, ENG-004 | 4.4 |
| 4.7 | ✅ Home + agency overview: unresolved/assigned conversation counts | TEN-003 | 4.2 |

**Gate (roadmap Phase 2):** reply delivery/reconciliation reliable; agency isolation tests pass with inbox data.

---

## Milestone 5 — Analytics & Reports (Phase 3) — ✅ core done (mock + Meta insights; 5.7/5.8 in progress on the quality track)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 5.1 | ✅ Metric contract registry (`lib/analytics/metrics.ts`, DEFINITIONS_VERSION) (name, definition, formula, unit, grains, provider mapping, freshness, version) | ANA-002 | — |
| 5.2 | ✅ Insights ingestion (`insights.ingest`, 15-min tick, 3-day revision tail): per-channel organic metrics, raw provenance retained, freshness tracked | ANA-001 | 4.1, 1.6 |
| 5.3 | ✅ Aggregates in Postgres (`metric_fact` grain store with revision) (daily facts per variant/channel), revision + backfill notes | analytics.md | 5.2 |
| 5.4 | ✅ Analytics UI (per `images/analytics.png`; paid/attribution cells fill in with M6): overview (scorecard, trend, channel mix, top content), content, engagement tabs; persistent date/comparison/scope filters; definitions & freshness on every metric | ANA-001, ANA-002 | 5.3 |
| 5.5 | ✅ CSV export with filters/definitions/freshness stamped | ANA-003 P0 | 5.4 |
| 5.6 | ✅ Saved reports (definitions, runs, scheduler, run-time recipient check), scheduled delivery with run-time permission checks | ANA-003 P1 | 5.5, 0.10 |
| 5.7 | 🔨 Data-quality checks (freshness, duplicates, implausible values, reconciliation) | analytics.md | 5.3 |
| 5.8 | 🔨 Product telemetry events (privacy-safe) | analytics.md | — |

**Gate (roadmap Phase 3):** provider totals reconcile within documented rules; every displayed metric has a published contract.

---

## Milestone 6 — Campaigns & Paid (Phase 4)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 6.1 | `campaign` model; attach content items; objective/dates/owner/tracking | CAM-001 | 2.1 |
| 6.2 | Campaigns list + detail tabs (Overview, Content, Ads, Audience, Conversations, Performance, Activity) | CAM-001 | 5.4, 4.2 |
| 6.3 | Ad account connection + **read-only import** of paid campaigns/spend/conversions (Meta first) with deep links to native manager | CAM-001 | 1.4 |
| 6.4 | Paid/organic split in analytics; deterministic campaign attribution | ANA-001 | 5.3, 6.3 |
| 6.5 | Promote-a-post: eligibility, preview, budget caps, policy + reauth + audit before any spend mutation | CAM-002 (P1) | 6.3, 3.1, 0.12 |

**Gate (roadmap Phase 4):** spend-changing flows pass finance/security review and provider certification.

---

## Milestone 7 — Improve & Expand (Phase 5)

Explainable recommendations, best-time analysis, content reuse insights, automation rules with approval gates, additional providers (YouTube, Pinterest, X), GA/commerce/CRM connections, SSO/SCIM, white-label agency reporting. Sequence after Phase 4 evidence; not planned in detail yet.

---

## Continuous tracks (every milestone)

Accessibility review (WCAG 2.2 AA), threat model updates, privacy/retention, performance budgets (P75 nav < 2.5s), i18n-ready strings, connector maintenance, docs/ADRs.

---

## Decisions to make before the milestone that needs them

| Decision | Needed by | Recommendation |
|---|---|---|
| Job queue: `pg-boss` vs Redis/BullMQ | M0.13 | pg-boss (no new infra; Postgres already in Terraform) |
| Object storage: Azure Blob vs S3-compatible | M1.9 | Azure Blob via S3-compatible SDK abstraction (`lib/storage.ts`) so local dev can use MinIO |
| Secrets/KMS: Azure Key Vault | M1.3 | Key Vault in prod; env-provided key in dev |
| Email provider | M0.10 | Whatever sparx already uses (Resend/SES/ACS) — abstract behind `lib/mail.ts` |
| Meta app review scope + TikTok access timeline | M1.6/1.8 | Start app review applications now; they gate launch providers |
| Virus scanning | M1.9 | ClamAV sidecar or cloud scan; block publish on `unscanned` |
| Analytics warehouse | M5 | Postgres aggregates first (per architecture.md); revisit after measured need |

---

## Parallel workstreams (started 2026-08-28)

Four agent-run streams with disjoint file ownership; the lead integrates, generates migrations serially, reviews diffs, and verifies in the browser:

1. **campaigns** — M6 (schema `campaigns.ts` + migration, ads contract/adapters, `ads.sync`/`promotion.execute`, campaigns list/detail per mockups, analytics paid cells).
2. **product-gaps** — 2.10 quick compose, 2.11 goals step, 2.12 templates/bulk reschedule, settings sections (Inbox, Tracking, Notifications), replace prompt() dialogs.
3. **quality** — 5.7 data quality, 5.8 telemetry, publication reconcile + token refresh jobs, OTel, Playwright + tenant-isolation suite, CI.
4. **providers** — LinkedIn/TikTok inbox+insights, Meta webhook mappings, token lifecycle, healthCheck, vitest suite, providers README.

## Immediate next steps (in order)

1. **M0.9** authorization helper + tests — everything mutating depends on it.
2. **M0.13** job runner + outbox — publishing and ingestion are impossible without it.
3. **M1.1–1.3** provider contract, connection tables, secret boundary.
4. **M1.4–1.6** OAuth + Connected accounts UI + Meta adapter (start Meta app review in parallel).
5. **M1.9–1.10** content library.
6. **M2** composer → scheduler → publish worker → calendar.

Roughly: M0 remainder + M1 ≈ the next sprint block; M2 delivers the first thing a customer can actually use.

# RocketEase — Implementation Plan

**Status:** living document. Sequenced from `docs/originals/roadmap.md` and the P0/P1 IDs in `docs/originals/requirements.md`. Update this file when scope or order changes; it is the source of truth for "what's next".

Each milestone is a shippable increment with an exit gate. Order inside a milestone is the recommended build order — later items depend on earlier ones.

Legend: ✅ done · 🔨 in progress · ⬜ not started · `REQ-ID` traces to requirements.md

---

## Milestone 0 — Foundations (Phase 0) — ✅ done (OTel export via `lib/otel.ts`; Playwright suite in `apps/platform/e2e` incl. tenant isolation, wired into CI)

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
| 0.14 | Observability: request IDs (middleware), structured JSON logs (`lib/log.ts`), `/api/health`, OpenTelemetry export (`lib/otel.ts`) | NFR-008 | ✅ |
| 0.15 | Vitest harness (authz matrix tested); Playwright e2e + tenant-isolation suite in `apps/platform/e2e`, wired into CI | release gate | ✅ |
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
| 2.10 | ✅ Mobile quick compose (`create/quick`, 4-step linear flow on the composer hooks) | flows.md | 2.3 |
| 2.11 | ✅ Onboarding goals step + Home checklist driven by real state: goals step, connect step, invite step, first-post step; checklist driven by domain events | ONB-001 | 1.4, 2.4, 0.11 |
| 2.12 | ✅ Templates + reuse with lineage (`content_template`); bulk reschedule from the calendar list | PUB-006 (P1) | 2.6 |

**Gate (roadmap Phase 1):** create → schedule → publish passes e2e on Meta + LinkedIn sandboxes; duplicate-publish tests (retry, ambiguous timeout, replay) pass; activation path measurable.

---

## Milestone 3 — Approvals & Collaboration (Phase 2, part A) — ✅ done (field/asset-anchored comments pending)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 3.1 | ✅ Approval policy model (`approval_policy`, matchPolicy, editor in Settings → Team and roles): by channel / campaign / author role / paid spend / risk label; separation-of-duty | COL-001 | 0.9, 2.1 |
| 3.2 | ✅ `approval_request`, `approval_decision` (immutable events), superseded-on-edit | COL-002 | 2.1 |
| 3.3 | ✅ Approvals queue UI (matches approvals.png; bulk approve skips stale/unauthorized): status/due/assignee filters, preview + diff, approve / request changes (comment required) / reject, bulk with stale-version skip | COL-002 | 3.2 |
| 3.4 | 🔨 Comments (item/version/field/asset region), assignments and activity history done (anchored comments landed 2026-08-28). Still open: **due dates on approval requests** → M14.3 | COL-003 | 2.1 |
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
| 4.3 | ✅ Mock/Meta/LinkedIn/TikTok inbox + insights adapters written (untested live; see `packages/providers/README.md` for what each API cannot do: LinkedIn has no DMs/webhooks and is partner-gated; TikTok has no DMs/mentions and needs a Business Account for comments) | ENG-001 | 1.6, 1.7 |
| 4.4 | ✅ Inbox UI: three-pane (queue / thread / context), filters, unread, assignment, status, priority, SLA timestamps; mobile drill-in | ENG-002 | 4.2 |
| 4.5 | ✅ Reply with provider delivery state (caveat: comment replies on Meta/LinkedIn/TikTok have no client reference, so an ambiguous comment reply can only be reconciled by text match — DMs reconcile via metadata); **ambiguous-send reconciliation** before retry | ENG-002, ENG-003 | 4.3 |
| 4.6 | ✅ Notes, snooze, resolve, escalate, saved replies (Settings → Inbox), response target | ENG-002, ENG-004 | 4.4 |
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
| 5.7 | ✅ Data-quality checks (nightly `quality.check`: freshness, duplicates, implausible, revisions, reconciliation → `data_quality_issue`, surfaced in analytics + export header) (freshness, duplicates, implausible values, reconciliation) | analytics.md | 5.3 |
| 5.8 | ✅ Product telemetry (`lib/telemetry.ts` → `product_event`, privacy-safe) events (privacy-safe) | analytics.md | — |

**Gate (roadmap Phase 3):** provider totals reconcile within documented rules; every displayed metric has a published contract.

---

## Milestone 6 — Campaigns & Paid (Phase 4) — ✅ core done (mock + Meta Marketing API adapters; verified against mock; no step-up re-auth before spend yet)

| # | Feature | Reqs | Depends on |
|---|---|---|---|
| 6.1 | ✅ `campaign` model; attach content items; objective/dates/owner/tracking | CAM-001 | 2.1 |
| 6.2 | ✅ Campaigns list + detail tabs (Overview, Content, Ads, Audience, Conversations, Performance, Activity) | CAM-001 | 5.4, 4.2 |
| 6.3 | ✅ Ad account connection + **read-only import** of paid campaigns/spend/conversions (Meta first) with deep links to native manager | CAM-001 | 1.4 |
| 6.4 | ✅ Paid/organic split in analytics; deterministic campaign attribution | ANA-001 | 5.3, 6.3 |
| 6.5 | ✅ Promote-a-post: eligibility, preview, budget caps, policy + reauth + audit before any spend mutation | CAM-002 (P1) | 6.3, 3.1, 0.12 |

**Gate (roadmap Phase 4):** spend-changing flows pass finance/security review and provider certification.

---

## Milestone 7 — Improve & Expand (Phase 5)

✅ Explainable recommendations, best-time analysis, content reuse insights, automation rules with approval gates, YouTube/Pinterest/X adapters (all 2026-08-28, verified against mock data). ✅ Conversion tracking sources — GA4, Shopify, and a signed generic conversion webhook (`db/schema/tracking.ts`, `lib/tracking/*`, `tracking.sync`, Settings → Tracking); `conversions`/`revenue`/`sessions`/`roas` become available per source with an explicit reason when they cannot. GA4 and Shopify are code-complete but **untested live** (no credentials); the webhook path works end to end. See `docs/tracking.md`. ✅ White-label agency reporting — branded HTML report documents (`lib/reports/render/*`, cover + scorecard with definitions + trend + mix + top posts + inbox service + paid + recommendations + definitions appendix), agency branding on organization metadata (Agency → Branding, per-client “use the client’s own brand”), signed expiring revocable share links at `/r/:token` (rate-limited, optional passcode, views audited with a truncated fingerprint), double-opt-in external recipients, the `client_report` mail, and a per-client agency roll-up. PDF is rendered only when `REPORT_CHROMIUM_PATH` points at a real Chromium; otherwise the HTML is the artifact and the UI says so. ✅ SSO (Better Auth sso plugin: OIDC/SAML per org, domain enforcement with owner break-glass, email-first login, SSO step-up branch) and SCIM 2.0 provisioning (Users/Groups/discovery, per-org bearer tokens, Entra-compatible `active` parsing) — SCIM proven end to end with curl; no live IdP exercised. Caveat: SAML ForceAuthn is not exposable through @better-auth/sso 1.7.2, so SAML step-up is recorded as `forced: false`.

---

## Milestone 8 — Stand out (from `docs/research/`, started 2026-08-28)

Positioning: **the honest social OS** — never a duplicate or phantom failure, every number has a definition, missing is never zero, platform limits shown before publish, AI drafts but a person presses send. **Pricing decision (user, 2026-08-28):** flat price per workspace per month, unlimited seats, client reviewers free; AI metered in credits (1 credit = 1,000 output tokens, input at 1/5) above a per-workspace monthly allowance, hard cap so no surprise bills; amounts live in Stripe price objects, never in the repo.

| # | Item | Status |
|---|---|---|
| 8.1 | Publish receipts — per-variant timeline (validated → sent → confirmed/reconciled, remote id, cost) on post detail + calendar | ✅ |
| 8.2 | Capability contract — public `/capabilities` page generated from `packages/providers`, in-app "why not" everywhere a control is disabled; fix Meta `reviews` over-declaration | ✅ |
| 8.3 | Metric continuity — Meta reach → "viewers" retirement: dual-track definitions, break annotations on charts/exports | ✅ |
| 8.4 | Rights & authorisation clocks — UGC licence windows, Spark codes, Partnership Ads grants; block/warn on publish or boost past expiry | ✅ |
| 8.5 | Publish cost & quota preview — per-network cost/quota in the composer before queuing; quota gauge on Connected accounts | ✅ |
| 8.6 | AI disclosure per destination — one synthetic-media flag → YouTube/TikTok/Meta declarations, audited (EU AI Act Art. 50, 2 Aug 2026) | ✅ |
| 8.7 | Public API + MCP server — API keys, draft/approve/schedule/report endpoints with approval gates intact | ✅ |
| 8.8 | AI that drafts, never publishes — caption variants, repurposing, inbox reply drafts grounded in brand voice; always lands as a draft | ✅ |
| 8.9 | Table stakes — evergreen recycling, hashtag sets, CSV import | ✅ |
| 8.10 | Review management — Google Business Profile adapter feeding the inbox `review` kind (human-only reply gate) | ✅ |
| 8.11 | Agency per-client cost & margin roll-up — `client_rate`, Economics section on the agency overview, CSV export (owner/admin only; unknowns never 0) | ✅ |

## Milestone 9 — Monetise & generate (started 2026-08-28)

| # | Item | Status |
|---|---|---|
| 9.1 | AI usage ledger + credits (`ai_usage`, monthly allowance, hard cap, usage meter) | ✅ |
| 9.2 | Stripe billing — per-workspace subscription, Customer Portal, AI overage via Billing Meters, webhooks, Settings → Billing, entitlements + 7-day grace | ✅ |
| 9.3 | Post & ad generator — brief → concepts per network + ad copy sets against network specs → draft in Create; env-gated image generation (`OPENAI_API_KEY`; routed through the media registry since 12.5). Needs: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_AI_ENABLED=1`; Stripe dashboard setup per `docs/billing.md` | ✅ |

---

## Milestone 10 — Brand hub (started 2026-08-28)

Brand was a single voice form at `settings/brand`. It is the input every generated post, ad, and image reads from, so it became a first-level area at `/app/:workspaceId/brand` (navigation.md and pages.md updated; `settings/brand` redirects).

| # | Item | Status |
|---|---|---|
| 10.1 | Brand kit model — `workspace.settings.brandKit`, tolerant read, per-section zod, audited section saves (`lib/brand`, `lib/actions/brand`) | ✅ |
| 10.2 | Identity, voice (+ banned words, emoji/spelling/CTA rules), messaging with dated offers, audiences, compliance rules, channel presence | ✅ |
| 10.3 | Visual identity — 8 logo variants via presigned upload, palette, typography with licence note, imagery direction | ✅ |
| 10.4 | Brand assets — library assets flagged as brand assets (rights/scan unchanged) plus external media references | ✅ |
| 10.5 | Wiring — kit in every copy prompt (concepts, ads, captions, repurpose, inbox replies) and appended to every image prompt; expired offers filtered against the workspace timezone | ✅ |
| 10.6 | Overview as a card grid (one card per section, showing what is actually in it), completeness meter, stale-offer/licence warnings, onboarding step, library brand-kit panel. Card empty states name what each gap costs. Cards follow `components/overview-card.tsx`, shared with Home | ✅ |

Not built: brand-kit export for clients, copy-brand-from-another-workspace, a pre-publish lint that blocks on banned words (rules reach the model, not the composer's publish check).

---

## Milestone 11 — Public site & legal (started 2026-08-29)

`apps/web` was a single landing page whose footer linked to 20 routes that all 404'd, and the missing
privacy/terms pages were a hard blocker on every provider app review (Meta needs a Privacy Policy URL
to leave dev mode; TikTok needs domain-verified ToS + Privacy URLs to submit at all).

| # | Item | Status |
|---|---|---|
| 11.1 | Site foundation — `lib/site.ts` (entity, contacts, URLs), `lib/nav.ts`, `PageShell`/`PageHeader`, dropdown nav + mobile nav, 5-column footer with a Legal column, `not-found`, `sitemap.ts`, `robots.ts` | ✅ |
| 11.2 | Legal document system — `content/legal/*` as typed block data (`Block`/`LegalSection`/`LegalDoc`), rendered by `components/legal/*` with a table of contents; `/legal` index | ✅ |
| 11.3 | 12 legal documents — privacy, terms, acceptable use, DPA, subprocessors, copyright/DMCA, cookies, data deletion, security, subscription & refunds, accessibility, your privacy choices | ✅ |
| 11.4 | Marketing pages — features, integrations (honest per-provider status), pricing (prices from `NEXT_PUBLIC_PRICE_*`, never in the repo), 4 solutions + index, about, contact, demo, developers, help, status, changelog, roadmap; honest empty states for blog/guides/templates/careers/partners | ✅ |
| 11.5 | **Provider deauthorize + data-deletion endpoints** — `parseSignedRequest` on the adapter contract (Meta HMAC-SHA256 impl, tested), `provider_deletion_request` table (migration 0016), `provider.deletion` queue + worker handler, `POST /api/connect/[provider]/{deauthorize,data-deletion}` returning Meta's `{url, confirmation_code}`, public `/data-deletion/[code]` status page | ✅ |

Done since: DNS for `app.rocketease.com`; TikTok URL domain verification; Meta callback URLs pasted
into the app dashboard. Still to do: set `NEXT_PUBLIC_PRICE_MONTHLY`/`NEXT_PUBLIC_PRICE_YEARLY` as
Docker build args; register the DMCA designated agent with the U.S. Copyright Office (renewable every
3 years — the policy page alone does not confer safe harbour).

**Note:** the registered legal name is **WizeWorks LLC** (with the `s`). `lib/site.ts` and the terms
lede said "WizeWork LLC" until 2026-08-29; both are corrected but `apps/web` needs a redeploy for the
published pages to reflect it. The Meta business portfolio is still named "WizeWork LLC".

---

## Milestone 12 — Ad creative generation (planned 2026-08-29)

Quality **image and video ad creative** — shots, voice-over, music, captions, per-network renders,
placement preflight, disclosure. Read before starting anything here:

- **`docs/media-generation.md`** — the pipeline, data model, workers, build order
- **`docs/media-models.md`** — model choices, output types, routing, and how the registry is managed
- **`docs/plans/m12.1-media-foundation.md`** — the execution plan for stage 12.1 (work packages, gates, env)
- **`docs/plans/m12.2-static-ad-creative.md`** — the execution plan for stage 12.2 (work packages, gates, findings)
- **`docs/plans/m12.3-voice-captions.md`** — the execution plan for stage 12.3 (captions, consent, burn-in)
- **`docs/plans/m12.4-video-assembly.md`** — the execution plan for stage 12.4 (assembly, audio mix, rights merge)
- **`docs/plans/m12.6-layered-acceptance-editor.md`** — layered acceptance + the plan editor (planned)
- `docs/research/ai-media-2026.md` — the evidence behind all three
- `docs/research/generation-competitors-2026.md` — Runway/OpenArt/DaVinci/Creatify deep-dive; carries the verified Sora retirement dates and the cost-parity analysis

**Build it, dogfood it, price it from measurement** (user decision, 2026-08-30). It ships behind a
**beta grant** — us first, then early adopters — and runs on RocketEase's own marketing before it is
offered. Pricing is deliberately deferred; cost is *instrumented* from the first render
(`media_job.vendor_cost_usd`, `quantity`, `unit`) plus a hard ceiling as a blast-radius limit, not as
pricing. The number that decides pricing is **cost per *approved* ad**, including discarded takes,
and only real use produces it. See `docs/media-generation.md` §9a for the gate and for what beta-only
lets us defer.

Text AI is done (M8.8, M9.3, M10.5). Media is one image adapter and a stub comment. The gap is not
"add a video model": `asset.process` handles images only, so a video upload gets a checksum and
nothing else, and `Capabilities.limits.videoMaxSeconds` is validated against a duration we never
learn. **That is a live defect in video publishing today**, before a frame is generated.

| # | Item | Status |
|---|---|---|
| 12.1 | **Pipeline foundation** — ✅ done 2026-08-30. Staff surface (`staff_user`, `requireStaff`, `/staff`); beta gate (`feature_grant`, `lib/features`, default closed); `packages/media` (registry, routing, cost, mock adapter with real decodable media); `media_job` + `media.*` queues + worker roles + a dedicated media Deployment with ffmpeg; ffprobe toolchain; `asset.process` split and extended (video/audio probe, poster, thumb); output normalization; cost instrumentation + hard ceiling; asset provenance and lineage. **Closes the live video-publishing defect.** 771 tests | ✅ |
| 12.2 | **Static ad creative** — ✅ done 2026-08-30. `AdPlan` on `content_item.ad_plan` (plan, not pixels); sourced canvas specs + safe-zone geometry; `ReferenceSet` downsampled to the routed model's ceiling with **named** drops; deterministic sharp/Pango compositing with **measured** type and reported font substitution; two-phase preflight (before a render for rights/clearance/resolution, after it for safe zones and overflow); render fingerprints so a stale render is detectable; `media.render` on the media worker. 897 tests | ✅ |
| 12.3 | **Voice & captions** — ✅ done 2026-08-30. `caption_track` (word timings) + `voice` (consent block); words→cues with stated rules; SRT/VTT sidecar with round-trip parsing; **ASS burn-in through libass with margins from the placement's safe zone**, verified in the pixels; transcription contract + mock transcriber; `media.transcribe` reconciling against our own row; consent enforced twice (before spend, and via the asset's rights scope); owner-only replicas, audited; nightly consent expiry. 966 tests | ✅ |
| 12.4 | **Video assembly** — ✅ done 2026-08-30. Two-pass assembly (normalise every shot to one canvas/fps/pixel format/audio layout, THEN concat — mixed formats otherwise stop after the first clip); the same composited type as an overlay layer; burned-in captions from the voice-over; audio mix with ducking and −14 LUFS; **rights merged across all ingredients on four axes**; the picture decides the length and a truncated voice-over is reported; `renderAdPlan` routes still-vs-cut from what the shots ARE. 1026 tests | ✅ |
| 12.4a | **First real adapter, and the last bypass closed** — ✅ done 2026-08-30. `packages/media/src/openai` implements `MediaAdapter` for Images and is registered in the catalog with pinned `vendorModelId`, unverified cost/terms recorded as null rather than guessed. The concept card's image button no longer calls a vendor directly: it routes, is checked against the spending ceiling it previously bypassed, and writes a `media_job` recording model + reason. `AI_IMAGE_MODEL` is gone — the model is a registry entry. Adapters declare `synchronous`; anything else is queued. Routing rejects an aspect a model does not render. 1077 tests repo-wide (+28 here) | ✅ |
| 12.5a | **Content credentials — probe, record, disclose** — ✅ done 2026-08-30. `lib/media/c2pa.ts` detects a C2PA manifest in the BYTES (JUMBF superbox, container-independent), so `ModelDescriptor.provenance.c2pa` is a claim we check rather than a fact we assert; disagreements land in `media_job.mismatches` beside the duration ones. Derived assets probe their own output instead of assuming a strip. A credential our pipeline removed is surfaced at publish time — the disclosure duty EU AI Act Art. 50 has carried since 2 Aug 2026, and the thing TikTok and Meta auto-label from. Detection, never validation. +22 tests here; 1117 repo-wide at completion | ✅ |
| 12.5b | Advanced motion & re-signing — reference-conditioned product motion (Seedance); multi-shot sequences (Kling); footage editing (Aleph); consent-gated performance transfer (Act-Two); music generation + `platform_clearance`. **Blocked**: each needs real vendor credentials before a descriptor can be written, music needs a licensed-data vendor decision, and C2PA re-signing needs a signing certificate set by hand in Key Vault. **Resolved 2026-09-01**: the fal adapter landed (see 12.6's row) — Kling 2.5 Turbo Pro is the default video route wherever `FAL_KEY` is set, and `azure-sora-2` carries `retiredAt: 2026-10-15` so routing drops it by itself on Azure's verified retirement date | ☐ |
| 12.6 | **Layered acceptance & the plan editor** — built 2026-09-01, pending live verification. `AdPlan.acceptances` (per placement, fingerprint-stamped — an edit reopens the draft); `renderAdPlan` (the flatten) refuses unaccepted placements; `acceptAdPlan` records + audits + queues only stale renders; shot regeneration is estimate-first in CREDITS (`previewShotGeneration`/`regenerateShot`/`adoptShotAsset` — adoption is a human action); plan editor at `create/plan/:contentItemId` (copy/shots/audio/captions/variants panels + layered browser preview running the renderer's own `resolveRenderSpec`/`layoutOverlays`, safe-zone guide, cue overlay, approximated mix — labeled approximate); "Ad creative" entry on post detail, beta-gated absent-not-locked. Also landed here: the **fal adapter** (Kling 2.5 Turbo Pro video I2V/T2V $0.07/s verified, FLUX.2 [pro] images; queue contract with persisted `remote_meta`; sora auto-retires 2026-10-15 via `retiredAt`); **orchestrated length** (pick 15/20/30s → `plan/duration.ts` splits into model-legal takes summing exactly to target → "Generate all missing takes" with the TOTAL credits shown first → 12.4 assembly joins them on accept; the preview plays takes sequentially); and the **removal of the quick library video tool** (one-click spend on the most expensive thing = cost trap; the rail points at the plan flow — user decision 2026-09-01). Next in-stage: WP7 take chaining (last-frame rendition → Kling I2V start image). Plan: `docs/plans/m12.6-layered-acceptance-editor.md` | ◐ |

Dogfood corpus: seven live brands — `sparx.works`, `meetpiggles.com`, `jotacular.com`,
`silicaui.com`, `wize.works`, `agconn.com`, `kanninja.com`. Private posting to a real network is
required for Meta's review anyway, so the provider track and this one feed each other.

**Static before video is deliberate.** Static ads are where compositing, brand binding, placement
preflight and variant discipline get built and proven — at cents per attempt instead of dollars.
Video inherits all of it.

Five findings from the research that drive the design, none of them obvious:

- **Route, don't pick.** Every serious 2026 platform is a router: Higgsfield switches 8+ video models
  per shot, Runway shipped Runway Dev as one API, fal.ai runs ~1,000 endpoints. There is no
  `AI_VIDEO_MODEL` env var — a model is chosen per job, from a registry, for a recorded reason.
- **The brand kit is the moat.** Every capable model now takes reference images (Veo 3.1
  "ingredients" 3, Seedance 9 img + 3 vid + 3 audio, Nano Banana Pro 14, Higgsfield "Soul ID"). The
  scarce input is structured per-client brand truth, and M10 already built it.
- **Composite type, never diffuse it.** Models are approximate at text; a price under a client's
  brand is not a place to be approximate. Compositing also makes safe zones checkable and copy edits
  free. Meta unified Stories/Reels in March 2026 on 14% top / 35% bottom / 6% sides.
- **Business accounts cannot use the platform music libraries, and licences do not travel.** Meta
  Sound Collection is cleared for Facebook and Instagram only; TikTok's Commercial Music Library for
  TikTok only. "One video, five networks" with library music is a violation on four of them. Nobody
  models this; it is the same shape as the M8.4 rights clocks.
- **Re-encoding strips C2PA.** Every ffmpeg pass destroys the credentials Veo/Sora attach — the exact
  machine-readable marking EU AI Act Art. 50 (in force 2 Aug 2026) and the platform auto-labellers
  rely on. We re-sign, or record `stripped` and say so.

Open decisions: `docs/media-models.md` §11 (primary router — fal + a direct Vertex adapter
recommended; Higgsfield as competitor-or-vendor; indemnity floor; seeds; consent-gated models in v1)
and `docs/media-generation.md` §12 (render build-vs-buy; Canva interop; C2PA signing identity; where
`AdPlan` lives; ceiling defaults).

---

## Milestone 13 — Grid (planned 2026-09-05)

A preview of the **profile page as the network will render it** — live posts and planned posts in
one grid, so a brand sees how the page will look before anything publishes. Competitors ship this as
"Feed Planner" / "Visual Planner" / "Grid Planner" (Later, Planoly, Plann, Preview). Ours is **Grid**.

**Decisions (user, 2026-09-05):**

- **A standalone feature, not a Calendar tab.** Calendar stays clean and simple; Grid gets its own
  route (`/app/:workspaceId/grid`), its own sidebar entry and its own designed empty state.
- **Name is "Grid".** "Feed" collides with the social-timeline meaning; "Planner" is already excluded
  by the Calendar naming rule.
- **Not Instagram-only.** First: Instagram (Posts, Reels), TikTok (profile), YouTube (Videos,
  Shorts). Later: Facebook (Page photos/Reels strip — a timeline, not a grid, so low value) and
  Pinterest (boards). LinkedIn has no grid and is excluded.

**Shape.** One feature, not six: each network surface is a small **profile layout** record — columns,
tile shape, what sorts first (pinned, then newest), which content kinds appear (Instagram never shows
Stories; a Reel appears in the Posts grid unless hidden) — sourced and dated like
`lib/media/canvas/specs.ts`, because networks change them (Instagram moved profile tiles from 1:1 to
3:4 in 2025). Live tiles come from the provider's content sync we already run; planned tiles are the
channel's scheduled/draft/awaiting-approval items ordered by `scheduled_at`. **Live tiles are locked.**
Dragging a planned tile swaps dates through the same reschedule action Calendar uses, so audit and
approval rules hold. Status on a tile is icon + label, never colour alone.

**Mockups (drafted and approved 2026-09-05):** `images/grid.png` (Instagram Posts grid with a
selected planned tile, cover-frame picker and drafts tray), `images/grid-youtube.png` (wide tiles
with titles, showing the layout spec varies per network), `images/grid-empty.png` (designed empty
state). Editable canvas: https://claude.ai/code/artifact/a818f4ed-8267-4dd9-a1be-2b81c012636e

| # | Item | Status |
|---|---|---|
| 13.1 | **Profile layout specs** — ✅ done 2026-09-05. `lib/grid/layouts.ts`: per surface (`instagram.posts`/`reels`, `tiktok.profile`, `youtube.videos`/`shorts`, `mock.profile`) columns, tile shape, formats shown, what never appears, and why pinned tiles are not modelled (no API exposes pinned state, so order is by date and the page says so). Every entry dated and sourced; observed layouts are `verified: false`. Tests pin the dating and that Stories and text never reach a grid | ✅ |
| 13.2 | **Live tiles** — ✅ done. Published variants for the channel inside a 90-day window, read from what the publish worker already wrote; a chosen cover frame wins over the thumb; the page never calls a network | ✅ |
| 13.3 | **Planned tiles & gaps** — ✅ done. Scheduled, draft, in-review and failed variants with a date merge newest-first with the live ones (`lib/grid/tiles.ts`). A **gap has a definition**: a stretch longer than the channel's rhythm with nothing planned, where the rhythm is the median spacing of the last 10 live posts (three needed, clamped to 1–7 days). No rhythm means no gaps — never a zero. Every number on the page carries its definition on hover; the rhythm line states it in words | ✅ |
| 13.4 | **Drag to reorder** — ✅ done. Scheduled tile onto scheduled tile = `swapSchedule` (every destination of both items re-queued through `enqueuePublish`, two `content.reschedule` audit rows); scheduled tile onto a gap = `rescheduleItem`; a draft from the tray onto a gap = `scheduleDraftAt` through `scheduleItemCore`, so approval and billing gates hold. Live tiles are not draggable. Every drop confirms first. "Move…" (a datetime field) is the keyboard path | ✅ |
| 13.5 | **Cover frame** — ✅ done. `asset_frame` (migration 0025) + the `asset.frames` media-worker job pull six stills spaced 5–95% through the clip on request, never on upload. The choice is `post_variant.settings.cover`, read again at publish (`lib/grid/cover.ts` → `PublishRequest.cover`), so the grid shows the frame the network will get. Adapters send what their API takes: Instagram Reels `thumb_offset`, TikTok `video_cover_timestamp_ms`, Pinterest `cover_image_url`, the mock records it; YouTube, Facebook, LinkedIn and X declare `cover: "none"` with a reason the panel shows. `Capabilities.cover` is a new capability path with a "Cover frame" column on `/capabilities` | ✅ |
| 13.6 | **Page** — ✅ done. `/app/:workspaceId/grid` (sidebar after Calendar, mobile under More): one profile at a time, per-surface tabs, stats + layout facts + rhythm line, phone-width preview for 3-column grids, selected-tile panel with the cover picker, drafts tray, designed empty state. **Verified live 2026-09-05 against the mock provider** (fresh tenant, real connect flow, seeded history): 4 live / 2 planned / 2 gaps / 8 days ahead rendered newest-first; swapping two scheduled tiles exchanged their dates; a live tile carried no `draggable`; a draft dropped on a gap was scheduled; six frames were pulled, one chosen, and the tile picture changed; "Move…" put the clip 90 s out and the publish worker logged `coverOffsetMs: 4720` for it — the chosen frame is what the mock publish received. 982 platform tests, 193 provider tests | ✅ |
| 13.7 | Later — Facebook Page photos/Reels strip; Pinterest boards; YouTube custom thumbnails (`thumbnails.set` needs a verified channel the API cannot report); promote the live check to a Playwright spec (today it is a script under the ignored `e2e/.state/grid-live/`) | ☐ |

**Gate:** against the mock provider, a channel with published and scheduled posts renders in the
network's tile order; dragging a scheduled tile changes its date and the change shows on Calendar;
a live tile cannot be moved; a cover frame chosen here is the one the (mock) publish sends.
**Met 2026-09-05** — see 13.6. Plan and record: `docs/plans/m13-grid.md`.

---

## Milestone 14 — Close the gaps (planned 2026-09-05)

**Decision (user, 2026-09-05): do ALL of these**, in this order. The list is every loose end left in
M0–M13 plus every research idea (`docs/research/`) and competitor table-stake not yet in the plan.
Each row ships on its own; the order puts cheap-and-visible first, big-and-slow last. Same rules as
every milestone: mockup in `images/` before a new screen, definitions on every number, never a zero
for an unknown, a person presses send.

| # | Item | Status |
|---|---|---|
| 14.1 | **Threads + Bluesky adapters** — `packages/providers/src/threads` (Meta container→publish, 250 posts/24h, Tech Provider Verification noted) and `src/bluesky` (AT Protocol, app password / OAuth, `createRecord` with image/video blobs, 300-grapheme limit, facets for links/mentions). Both free, no audit, so they can be dogfooded live at once. Capability catalog entries with every "no" explained; `/capabilities` page; Grid layouts only if either renders a profile grid (Threads does not; Bluesky does not) | ⬜ |
| 14.2 | **Notifications center** — finish 2.9: in-app list at `/notifications` (table + writes exist), read/unread, deep links, per-user preference model (publish failures, approvals, mentions, connection health; in-app vs email per event) | ⬜ |
| 14.3 | **Approval due dates** — finish 3.4: `due_at` on approval requests, overdue badge on Approvals + sidebar count, reminder mail, "overdue" in the Home attention queue | ⬜ |
| 14.4 | **Brand hub leftovers** (M10) — brand-kit export for clients (PDF/HTML like the report renderer), copy a brand from another workspace, and a pre-publish lint that BLOCKS on banned words/claims in the composer's publish check (today the rules only reach the model) | ⬜ |
| 14.5 | **Link-in-bio page** — one public page per workspace at a RocketEase host (`/l/:slug`, custom domain later): ordered links, latest-posts strip from published variants, per-link click counts written to the tracking layer (`conversion_fact`-adjacent, never invented), brand kit for look. Mockup first | ⬜ |
| 14.6 | **Comment moderation rules** — hide/flag/auto-reply-draft by rule (keyword, link, language, repeat offender) inside the inbox; every action is a `message`/audit row; hides call the provider's hide API where one exists and record "why not" where it does not | ⬜ |
| 14.7 | **DM rules engine** — model Meta's messaging windows and caps (24 h window, qualifying action, ~200 automated DMs/hr, 2026 one-automated-message rule); before a reply queues, say whether it can send and why not; surfaces on inbox reply and automations | ⬜ |
| 14.8 | **Google Business Profile posts** — the GBP adapter publishes `localPosts` (standard/offer/event) to a location; today it is reviews-only. Formats + limits from the Business Profile API; quota-0 gate already documented | ⬜ |
| 14.9 | **Canva / Adobe Express import** — resolve the M12 §12 open decision first (Canva Connect API vs Express embed); then "Import from Canva" into the library with rights = owned, provenance chain recorded | ⬜ |
| 14.10 | **Per-client billing** — agencies bill each client workspace: client rate (M8.11) becomes an invoice line via Stripe Connect or Stripe Invoicing on the agency's own account; RocketEase never touches the money; statements in the agency overview | ⬜ |
| 14.11 | **Listening + ad-library intelligence** — keyword/brand listening on networks whose APIs allow it (Bluesky firehose, Threads keyword search, YouTube/Reddit search) and the EU DSA ad repositories (Meta Ad Library API, TikTok Commercial Content Library) as a competitor paid-creative feed; definitions and coverage gaps stated per network | ⬜ |
| 14.12 | **Self-hosted agency tier** — licence-owned install: single-org mode, licence key check, offline-safe feature gating, Helm chart from `deploy/k8s`, update channel. Last because it changes how flags, billing and staff work | ⬜ |

Also still open, owned by the user not the code: M11 launch chores (price build args, DMCA agent
registration, web redeploy for the legal name), provider credentials and app reviews
(`docs/provider-apps.md`), and M12.5b/12.6 vendor keys + live check.

---

## Continuous tracks (every milestone)

Accessibility review (WCAG 2.2 AA), threat model updates, privacy/retention, performance budgets (P75 nav < 2.5s), i18n-ready strings, connector maintenance, docs/ADRs.

---


### Deferred — revisit before launch

- ~~**Transactional email**~~ — ✅ **closed 2026-08-30.** Google Workspace SMTP relay,
  authenticating as the `noreply@rocketease.com` service account with an App Password;
  `MAIL_FROM` stays the `hello@` group. Mailgun was the original plan and was dropped:
  the domain is already on Workspace with SPF/DKIM/DMARC aligned, so the relay needed no
  new vendor. `SMTP_URL` is back on the deploy job's `required` list.

  What Mailgun would still buy, if this is revisited: bounce and complaint handling,
  a suppression list, delivery webhooks, and a sending SUBDOMAIN with its own DKIM key.
  Workspace gives none of those — a bounced password reset is invisible — and it cannot
  isolate subdomain reputation, because it signs with the registered domain's key
  regardless of the From subdomain. The relay ceiling is ~10,000 recipients/day.

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

## Parallel workstreams (started 2026-08-28) — all four landed the same day

Four agent-run streams with disjoint file ownership; the lead integrates, generates migrations serially, reviews diffs, and verifies in the browser:

1. **campaigns** — M6 (schema `campaigns.ts` + migration, ads contract/adapters, `ads.sync`/`promotion.execute`, campaigns list/detail per mockups, analytics paid cells).
2. **product-gaps** — 2.10 quick compose, 2.11 goals step, 2.12 templates/bulk reschedule, settings sections (Inbox, Tracking, Notifications), replace prompt() dialogs.
3. **quality** — 5.7 data quality, 5.8 telemetry, publication reconcile + token refresh jobs, OTel, Playwright + tenant-isolation suite, CI.
4. **providers** — LinkedIn/TikTok inbox+insights, Meta webhook mappings, token lifecycle, healthCheck, vitest suite, providers README.

## Immediate next steps — refreshed 2026-09-05

**The queue is Milestone 14, top to bottom** (user decision 2026-09-05: do all of it). Start at 14.1.
Launch chores and app reviews below run in parallel and are not code.

## Earlier next steps (2026-08-28), kept for the record

M0–M6 are built and verified against the mock provider. What remains before a real launch:

1. **Credentials & app review** — 🔨 in progress, see **`docs/provider-apps.md`** for per-platform state, blockers and resume steps. As of 2026-08-29: Meta, LinkedIn, TikTok and Google apps are registered and their credentials are in `.env`; LinkedIn Community Management (organization posting) and Pinterest are submitted and awaiting review; TikTok is in Draft pending a demo video; X is deferred (paid tier). Every real adapter is still untested live — `packages/providers/README.md` lists scopes and prerequisites. **The production container does not yet have the provider env vars**, so every `/api/webhooks/*` returns 404 and no live OAuth can run.
2. **Deploy** — ✅ infrastructure applied 2026-08-29 (`deploy/README.md`): own Postgres 18 flexible server, Key Vault, storage account and CI identity on the sparx AKS cluster, via `sparx.works/terraform/{envs/azure,bootstrap-azure}/rocketease.tf`. Storage is a native **Azure Blob** driver (`lib/storage/azure.ts`) — Azure has no S3-compatible API, so the old "Azure Blob (S3 API)" note was wrong. Routing is the shared Caddy, not an Ingress. Remaining: set `SMTP-URL` (see below), first push to `main`, make the three GHCR packages public, verify pods, then flip `rocketease_dns_enabled` for the DNS cutover.
3. ~~Hardening leftovers~~ — ✅ done 2026-08-28: step-up re-auth (password/TOTP, 5-min window) before paid spend, structural comment-reply reconciliation (no text markers), field/asset-anchored approval comments, composer UTM prefill, e2e hardened for dev compile latency (note: `auth` and `inbox` specs still flake under `next dev` when run as a full suite — every step passes in isolation; CI runs the production build).
4. **M7** — ✅ best-time analysis + explainable recommendations (`lib/recommendations`), ✅ automation rules with approval gates (Settings → Automations), ✅ YouTube/Pinterest/X adapters (untested live; see providers README for tier/quota gates). ✅ conversion tracking sources (GA4 / Shopify / signed webhook — GA4 and Shopify untested live; `docs/tracking.md`). ✅ white-label agency reporting (branded documents, agency branding, `/r/:token` share links, double-opt-in client recipients, agency roll-up). ✅ SSO/SCIM (SCIM curl-proven; IdP untested live; SAML ForceAuthn unavailable upstream). Remaining before launch: provider/IdP/GA4/Shopify credentials, AKS deploy (Terraform path needed), Chromium for PDF reports.

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

## Parallel workstreams (started 2026-08-28) — all four landed the same day

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

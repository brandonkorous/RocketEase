# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

**RocketEase** — "Effortless Launch. Better by Design." A social marketing operating system (plan, publish, engage, promote, measure) for businesses and agencies.

## RULE #0.5 — Files requirements

1. **No file shall be more than 250 lines long.** If it is, split it into a `components/` or `lib/` subdirectory.
2. **No methods shall be more than 50 lines long.** If it is, split it into a helper function or a subcomponent.
3. **Comments must be short and precise.** If a comment is more than 3 lines long, it is probably explaining a design flaw that should be fixed instead of explained.
4. **If you touch a file, you must apply this rule set to it.** If you are editing a file that is already too long, you must split it into smaller files. If you are adding a new file, you must make sure it is not too long.

## Repo layout

pnpm workspace monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). Git remote: `brandonkorous/RocketEase`.

- `apps/web/` — `@rocketease/web`: the marketing site (landing page) — Next.js 15 App Router, React 19, Tailwind v4, **Silica UI** (`@wizeworks/silicaui` + `@wizeworks/silicaui-react`). Built from `docs/originals/landing.md`.
- `apps/platform/` — `@rocketease/platform`: the authenticated product at `/app/:workspaceId/...`. Next.js 15 + Silica UI + **Better Auth** (email/password + organization plugin) + **Drizzle** on **self-hosted Postgres** (Docker locally, Azure in prod via the sparx.works Terraform → sparx AKS cluster). Phase 0 done: tenancy (Organization → Workspace → 8 workspace role presets), audit log, onboarding, black-sidebar shell, every route from navigation.md as a designed empty state, agency overview. No provider integrations yet.
- `packages/ui/` — `@rocketease/ui`: shared source-only package (icons: `Mark`, `PlatformIcon`). Import as `@rocketease/ui/icons`; both apps list it in `transpilePackages`.
- Both apps build as standalone containers (`Dockerfile` per app, build context = repo root). Never add Vercel/SWA configs.
- `docs/IMPLEMENTATION_PLAN.md` — **the build order.** Milestones 0–7 with feature tables, requirement IDs, dependencies, gates, and pending decisions. Check it before starting work; update it when scope/order changes.
- `docs/originals/` — 16 canonical spec documents (product, requirements, design, architecture, data/content model, users, permissions, navigation, pages, flows, integrations, analytics, onboarding, roadmap) plus `landing.md`, a ~1,500-line landing-page spec. Start at `docs/originals/README.md` for the index and shared vocabulary.
- `images/` — reference mockups (planner, create-post, inbox, analytics, approvals, settings, landing, pricing…) and `icon.png`. Note: the `landing.png` mockup contains invented stats/customers/testimonials that the spec forbids — don't copy those.

## Commands

```bash
pnpm install                 # root — installs all workspaces
pnpm dev                     # starts Postgres (docker) + BOTH apps: web :5000, platform :5001
pnpm dev:web / dev:platform  # one app only (dev:platform also starts Postgres)
pnpm dev:kill                # stop this repo's dev servers + worker (--all also stops containers)
pnpm db:up / db:down         # Postgres container only
pnpm db:migrate              # apply platform migrations from the root
pnpm build                   # build every workspace
pnpm typecheck               # tsc --noEmit in every workspace
```

Platform app (run from `apps/platform`; copy `.env.example` → `.env` first):

```bash
docker compose up -d          # root — Postgres 17 on localhost:5050 (rke/rke, db rocketease)
pnpm db:generate              # drizzle-kit: write a migration from db/schema/*.ts
pnpm db:migrate               # apply migrations
pnpm auth:generate            # regenerate db/schema/auth.ts after changing Better Auth plugins
                              #   (uses scripts/auth-schema.config.ts — a DB-free mirror of lib/auth.ts;
                              #    then run db:generate + db:migrate). Uses `npx auth@latest`; the old
                              #    `@better-auth/cli` package is deprecated and emits a stale schema.
pnpm dev                      # http://localhost:5001 (web app: pnpm dev in apps/web → :5000)
```

Tests: `pnpm exec vitest run` in `apps/platform` and `packages/providers`; Playwright e2e in `apps/platform/e2e`. Gotcha: `next build` and `next dev` share `apps/platform/.next` — after a production build, delete `.next` before starting `pnpm dev` or the webpack cache is corrupt (ENOENT `*.pack.gz`) and the stack dies.

## Platform conventions (apps/platform)

- **Tenancy is server-enforced on every request.** Use `requireUser()` / `requireWorkspace(id)` from `lib/session.ts`; the latter verifies workspace membership and redirects non-members (no existence leak). Every workspace-scoped table carries `organization_id` + `workspace_id`.
- Organization + org membership live in Better Auth's tables (`db/schema/auth.ts`, generated — don't hand-edit). Workspace, `workspace_membership` (roles from permissions.md), and `audit_event` are ours in `db/schema/app.ts`.
- Mutations are server actions in `lib/actions/*`; call `audit()` (`lib/audit.ts`) for anything in permissions.md's audit list. Audit rows are append-only.
- `middleware.ts` is only an optimistic cookie check — never treat it as authorization, and don't add a "logged-in → redirect away from /login" rule there (a stale cookie loops); auth pages do the real session check.
- Route map and labels come from `lib/nav.ts`; keep the vocabulary rules (Calendar/Create/Connected accounts).
- **Screens follow the mockups in `images/`** (user requirement). Open the matching PNG before building/restyling a screen; reproduce its layout and panels. Naming still follows navigation.md.
- **Providers**: `packages/providers` is the adapter contract; `mock` (dev, `PROVIDERS_ENABLE_MOCK=1`) exercises the full connect → select → sync → publish → reconcile loop locally; `meta`/`linkedin`/`tiktok`/`threads`/`bluesky` and the rest are real API code, untested live until credentials exist. Tokens are AES-GCM envelopes bound to the row id (`lib/crypto.ts`, `lib/providers.ts`); never log or return them. A network with no OAuth (Bluesky app passwords) declares `credentialsForm` + `signIn`; the start route sends it to `/accounts/connect/:provider` and the action seals the credential through the same `persistConnection` the OAuth callback uses. Every sourced limit lives in the adapter's `LIMITS` with the doc it came from; a number nobody published is not declared.
- **Jobs**: enqueue only via the transactional outbox (`emit(tx, name, payload)` in `lib/jobs/outbox.ts`); the worker relays. Queue names/payloads live in `lib/jobs/queues.ts`; handlers in `worker/handlers/`. Worker code must not import `server-only` or `next/headers` (use `lib/audit.ts`'s dynamic pattern).
- **Publishing**: `post_variant` state is authoritative; `content_item.status` is a summary (`summarizeItem`). The publish worker revalidates everything first, treats ambiguous provider errors by **reconciling before any retry**, and only retries retryable categories with backoff. Never bypass `idempotencyKey`.
- **Staff & betas**: `lib/staff/` is RocketEase's own operator surface at `/staff` (`requireStaff`, 404 for
  everyone else, `STAFF_EMAILS` bootstrap requires a verified email). Staff is a property of a PERSON,
  orthogonal to tenancy — it never composes with `requireWorkspace`, and there is no code path where
  being staff changes what a tenant-scoped query returns. `lib/features/` is beta enrolment
  (`feature_grant`, default closed, `hasFeature(orgId, "media.generation")`) — a fourth kind of "no",
  distinct from `lib/flags.ts` (global ops), entitlements (billing) and `can()` (role).
- **AI drafting**: `lib/ai/` builds prompts that call nothing (`prompts.ts` is testable on its
  own), `lib/ai/client.ts` owns POLICY — configured, budget, metering, and never throwing —
  and `lib/ai/transport/` owns WHICH VENDOR. Two transports, selected from configuration
  alone: Azure OpenAI (production, gpt-5.4 on DataZoneStandard, so drafting prompts stay in
  the US) wins when its text deployment is set; Anthropic otherwise. **Switching vendor is
  env, not code** — that seam was added the day a subscription turned out not to be able to
  buy Claude at all, and its absence made a config problem into a rewrite. `max_tokens` is
  Anthropic's; gpt-5.x REJECTS it and needs `max_completion_tokens`.
- **Media generation**: `packages/media` is the adapter contract (`MediaAdapter`, model registry,
  per-`JobKind` routing with a recorded `model_reason`, honest `{ unknown }` cost estimates).
  **What a vendor BILLS is not always the unit we estimate in** — Azure prices images per
  token and publishes no per-image meter — so `cost.tokenRates` carries the real rate and
  `vendor_cost_usd` is computed from reported usage, never from the estimate;
  `mock` exercises the whole loop with real decodable fixtures and zero spend. **There is exactly
  one image path**: every generation routes through the registry, so nothing calls a vendor
  directly and nothing escapes the ceiling. A model is a pinned catalog entry, never an env var.
  **Spend must be readable, not merely recorded** — but by the RIGHT audience.
  `vendor_cost_usd` is our cost of goods: logged on every completion and shown on `/staff`,
  because it is what the monthly ceiling accrues against and a silent null would disarm it.
  It is NOT shown in a workspace, where it hands a customer our margin. Customers see
  **credits**, the one unit drafting already bills in, written to the same `ai_usage` ledger
  by the same `creditsFor()` formula. And the TOKENS are kept (`media_job.input_tokens` /
  `output_tokens`): they are what the vendor metered, dollars are arithmetic on a rate we
  configure, and keeping only the money means a wrong rate can never be recomputed — which
  is exactly what happened (docs/bugs/B-004). Image generation is
  reachable WITHOUT the text model (`generateImage` checks `canGenerate`, never
  `aiConfigured`) — two vendors, two keys, so one being down must not take the other with
  it. An adapter declares `synchronous` when `start` does the whole job — `runMediaJobNow` runs those
  inline and QUEUES everything else, because an adapter holding job state in memory cannot be
  started in the web process and polled in the worker.
- **Content credentials** (M12.5a, `docs/plans/m12.5a-provenance.md`): `lib/media/c2pa.ts` PROBES
  the bytes for a C2PA manifest (JUMBF superbox, one container-independent path) — a model
  descriptor's `provenance.c2pa` is the vendor's CLAIM, checked like a claimed duration, and a
  disagreement is a recorded mismatch. It **detects, never validates**: nothing says "verified"
  without the trust list. Precision beats recall — a bounded scan reports `bounded`, so `absent` is
  never overstated. A credential our own re-encode removed is `stripped`, worded as something that
  happened and surfaced at publish time; blocking is wrong, because a caption label is a real
  disclosure and re-signing needs a certificate we don't have. Generation is a SPEND
  mutation: `media.generate` is `stately`/`retryLimit: 0` and **reconciles against the vendor before
  any re-spend**. `lib/media/` probes rather than believes — ffprobe decides duration and dimensions,
  and an unavailable tool records unknown, never 0. `WORKER_ROLE=media` runs ffmpeg work
  (`asset.process`, `media.*`) in its own Deployment. See `docs/media-generation.md`,
  `docs/media-models.md`, `docs/plans/m12.1-media-foundation.md`.
- **Ad creative** (M12.2, `docs/plans/m12.2-static-ad-creative.md`): an `AdPlan` is a PLAN, not a
  picture — it lives on `content_item.ad_plan` (untyped column, always read through
  `lib/media/plan/schema.ts`). **Type is composited, never diffused**: `lib/media/compose/` draws the
  price, CTA, logo and legal line with sharp/Pango from the brand kit, and it MEASURES type rather
  than estimating it. `lib/media/canvas/specs.ts` holds sourced placement geometry — dimensions block,
  safe zones warn, because nobody publishes 14/35/6 in a readable form. A variant differs on exactly
  ONE axis, and an axis with nothing to change is `inert`, never a duplicate render. The renderer
  reports (where overlays landed, which fonts it got); `lib/media/preflight/` judges. A derived asset
  INHERITS its source's rights envelope. Brand logos are storage keys, not asset ids — see
  `lib/media/locator.ts`.
- **Captions & voice** (M12.3, `docs/plans/m12.3-voice-captions.md`): **words are the source of
  truth** — cues are derived on every read (`lib/media/captions/cues.ts`) and the SRT/VTT sidecar is
  regenerated whenever words change, so nothing goes stale. Burned-in pixels are the DEFAULT, not
  the fallback: only YouTube takes a sidecar over its API. Burn-in is ASS through libass
  (`captions/ass.ts`), and its bottom margin comes from the placement's safe zone, so captions clear
  the Reels chrome by construction. `lib/media/voice/policy.ts` is the consent gate — stock voices
  need nothing, `cloned`/`likeness` need a complete, unexpired, unrevoked record; enforced twice
  (before spend in `createMediaJob`, and again because the asset inherits the consent's rights
  scope). Registering a replica is owner-only and audited; withdrawal is a record, never a delete.
- **Video assembly** (M12.4, `docs/plans/m12.4-video-assembly.md`): **two passes, always** —
  `lib/media/video/assemble.ts` normalises every shot to one canvas/fps/pixel format/audio layout
  BEFORE concatenating, because the concat demuxer needs identical streams and a mixed-format join
  produces a file that stops after two seconds with no error anywhere. The audio graph is built as a
  testable string (`video/audio.ts`): bed attenuated, ducked against the voice via
  `sidechaincompress` with a padded key, `amix` with `normalize=0`, then `loudnorm` to −14 LUFS. The
  **picture decides the length** (`-shortest`); a voice-over that gets cut off is reported, never
  silent. `lib/media/rights-merge.ts` takes the narrowest of EVERY ingredient across four
  independent axes (scope, expiry, licence, per-network clearance) — inheriting from one "base"
  asset gets three of them wrong. Still-vs-cut is routed from what the shots ARE, not a flag.
- **Grid** (M13, `docs/plans/m13-grid.md`): the profile page as the network renders it, per SURFACE
  (`lib/grid/layouts.ts` — observed and dated, `verified: false`; no API exposes pinned state, so
  order is by date and the page says so). **A move is a reschedule**: swapping tiles re-queues both
  items through `enqueuePublish`, a draft dropped on a gap goes through `scheduleItemCore`, and live
  tiles never move. **A gap has a definition** — a stretch longer than the channel's rhythm (median
  spacing of the last 10 live posts, three needed) with nothing planned; no rhythm means no gaps,
  never a zero. A cover frame is `post_variant.settings.cover`, read again at publish
  (`lib/grid/cover.ts` → `PublishRequest.cover`); an adapter takes an offset, a picture, or declares
  `cover: "none"` with a reason. Frames are pulled on request (`asset.frames`, media worker), never
  on upload.
- **Storage**: `lib/storage/` — one API, two drivers chosen by `STORAGE_DRIVER`: `s3.ts` (MinIO locally at :5090, console :5091) and `azure.ts` (Azure Blob in production; Azure has **no** S3-compatible API, so it is a real driver, not a re-pointed endpoint). Browser uploads go straight to storage via presigned PUT; `asset.process` makes renditions and runs the scan hook. Unscanned/expired-rights assets can't publish.
- **Conversion tracking** (`lib/tracking`, `docs/tracking.md`): GA4 / Shopify / signed webhook sources write `conversion_fact` via `tracking.sync`. Site-reported and ad-reported conversions never double-count — a paid `utm_medium` belongs to the ad platform, everything else to the tracking source; ROAS is paid-medium revenue ÷ spend. `lib/tracking/availability.ts` owns every "why is this unavailable" string; never show a missing conversion metric as 0.
- **Inbox**: `packages/providers` inbox contract (`fetchInbox`/`reply`/`findReply`/`inboxItemsFromWebhook`, `inbox-types.ts`). Ingestion is `lib/engagement/ingest.ts` (idempotent on channel+remoteId) fed by `inbox.sync` polling (worker tick every 2 min) and `POST /api/webhooks/[provider]` → `webhook_receipt` → `webhook.process`. Outbound replies are `message` rows in `queued` state delivered by `inbox.reply`; an ambiguous provider result is reconciled with `findReply` before any resend (ENG-003). The mock store lives in the worker process, so local "simulate incoming" goes through the webhook receipt path, never a direct in-process call.
- Local URLs: web :5000, platform :5001, Postgres :5050, Mailpit UI :5026, MinIO :5090/:5091. `pnpm dev` starts all of it including the worker.
- Silica gotchas beyond the web ones: `DropdownMenuLabel` must be inside `DropdownMenuGroup` (Base UI 1.7); portaled popups need `data-theme` + the `[data-base-ui-portal]` z-index rule in `globals.css` to render above the dark sidebar.
- **Brand hub** (M10 + M14.4, `docs/plans/m14.4-brand-leftovers.md`): the kit lives on
  `workspace.settings.brandKit`, always read through `lib/brand/read.ts`. **Only what a machine can
  check without guessing blocks**: `lib/brand/lint.ts` refuses banned words verbatim and the phrases
  in quotes inside a claim rule, whole-phrase and case-insensitive, from inside `validateVariant` —
  so every path that publishes refuses the same post with the same words. The rest of the kit is
  guidance for the model and the reviewer. The export is a DOCUMENT on the report shell (logos as
  data URIs, “Not recorded yet” for gaps, PDF only through a real renderer). Copying a kit between
  workspaces copies logo FILES into the target's own keys and never copies library asset ids — an
  asset row belongs to one workspace.
- **Approval due dates** (M14.3, `docs/plans/m14.3-approval-due-dates.md`): every request has a
  `due_at` — the requester's own, else the policy window (24 h without a policy); a time not ahead of
  now is refused. **Overdue has ONE definition** (`lib/approvals/rules.ts`: pending and past due) and
  every surface reads it — the Overdue tab, the sidebar badge, Home, the post banner, the agency
  overview. The badge counts requests you can decide or asked for, because navigation.md allows a
  badge only for an actionable count. **One reminder per deadline**: the 5-minute sweep CLAIMS the
  request (`reminded_at`) before notifying, so a retry cannot remind twice, and moving the deadline
  forward re-arms it. The reminder shares the "Approval requests" preference: switching requests off
  switches reminders off too.
- **Notifications** (M14.2, `docs/plans/m14.2-notifications.md`): kinds are a CLOSED union in
  `lib/notifications/catalog.ts` — `notify()` refuses anything else, so every kind has an icon, a
  status chip (icon + label) and an action label before it can be emitted. Members choose per
  preference and per channel (in-app, email); publish failures are locked to in-app. Every tab count
  has a definition. `connection.health` fires on the TRANSITION into a broken state only
  (`health-rules.ts`), never on every sync of a channel that is already broken.
- **Feedback is toasts, not inline alerts.** `useActionFeedback()` (`lib/use-action-feedback.ts`) wraps a server action: error → red toast, ok → green toast, then `router.refresh()`. Server-derived one-shot messages use `<QueryToast>`. Keep `Alert` only for persistent/blocking states (e.g. a connection that must be fixed before continuing).
- **No arbitrary Tailwind values** (`text-[11px]`, `max-w-[520px]`, `bg-[#hex]`, `rounded-[10px]`…). Use the built-in scale and Silica tokens (`text-xs`, `max-w-130`, `text-secondary`, `rounded-field/box`, `bg-error/10`). The only accepted exceptions: CSS grid templates (`grid-cols-[1fr_240px]`), platform brand colors inside `NetMark`/`PlatformIcon`, and hero type in `globals.css`.

## Silica UI conventions (apps/web)

- Theme is declared in `apps/web/app/globals.css` via `@plugin "@wizeworks/silicaui/theme"`: `rke` (default light, primary = black) and `rke-dark` (island for the results band/footer via `data-theme="rke-dark"`). Change palette through tokens, never hardcoded hex on components.
- `@source "../node_modules/@wizeworks/silicaui-react/dist"` in globals.css is required so Tailwind sees the React components' utilities.
- Silica React components are `"use client"`. From a **server component**, never pass `render={<Link/>}` — use `buttonClasses()` / `badgeClasses()` from `@wizeworks/silicaui-react/server` on a plain `<Link>` instead (see `components/sections/`). Client components (`site-nav.tsx`) can use `render`.
- When revealing a `.btn` responsively use `hidden sm:inline-block`, not `sm:inline-flex` — the latter drops Silica's vertical centering (documented gotcha in the plugin).
- Product surfaces (`components/product-surfaces/`) are real HTML/Silica UI, not screenshots, so they stay in sync with the design system. Their data is illustrative only.
- Platform brand colors live only inside `PlatformIcon` (`components/icons.tsx`); pass `mono` for monochrome contexts.

## Deployment

Production is the shared **sparx AKS cluster** (`aks-sparx-prod-cus`) in a `rocketease`
namespace, with RocketEase's own Postgres server, Key Vault and storage account.
**Read `deploy/README.md` before touching anything deployment-shaped.** The traps
that cost a release, in short:

- **No Ingress, no cert-manager.** A shared Caddy in `sparx-prod` terminates TLS and
  proxies to the Services. An `Ingress` object here is silently inert. Host blocks live
  in `sparx.works/k8s/ingress/Caddyfile`, and every hostname must ALSO be allow-listed in
  api-rest's `PLATFORM_HOSTNAMES` or Cloudflare answers 525 for that name alone.
- **`NEXT_PUBLIC_*` is baked at build time**, so it is a Docker build arg, never a
  ConfigMap value. A missing one does not error — the browser gets `undefined` and the
  feature quietly never renders.
- **Migrations run as an in-cluster Job**, never from a laptop or a runner: the Postgres
  server has no public network access. The app connects as a restricted role that cannot
  execute DDL in `public`, but OWNS the `pgboss` schema because pg-boss issues DDL at
  runtime.
- **`TOKEN_MASTER_KEY` is set once, by hand, in Key Vault** and must never be
  Terraform-managed: regenerating it makes every stored provider token undecryptable, and
  no re-run recovers them.

Azure resources and DNS live in the **sparx.works** repo
(`terraform/envs/azure/rocketease.tf`, `terraform/bootstrap-azure/rocketease.tf`,
`terraform/modules/dns`), not here.

## Working with the docs

- The docs are declared **canonical until superseded by a recorded product decision**. Treat them as the source of truth; don't silently contradict them — change the doc.
- **Never invent** customer proof, metrics, testimonials, benchmarks, or platform/provider capabilities. The docs repeat this; honor it in any copy, mock data, or UI you produce.
- Use the shared vocabulary from `README.md`: Organization (billing boundary) → Workspace (brand/client) → Channel (connected profile/page/ad account); Campaign; Content item → Post variant; Conversation; Report.
- Naming rules (`navigation.md`): say "Calendar" (not Planner/Scheduler), "Create" in UI ("Composer" only internally), "Connected accounts" in-product vs "Integrations" for the public ecosystem, "Campaigns" for the organic+paid container and "Ads" inside campaign detail.

## Design constraints (apply to any UI/landing work)

- **Black, white, and structure.** RocketEase is monochrome; only social platforms bring color (logos, channel badges, per-network chart series). No brand accent color.
- Explicitly banned: gradients, eyebrow headings, editorial layouts, giant decorative type, glass/neon, generic SaaS illustration, decorative AI imagery, card grids for everything, over-rounding, heavy shadows.
- Tokens in `design.md` (app) and `landing.md` §5/§30 (landing): `--black: #0a0a0a`, gray-50…950 neutral scale, semantic `--danger/--warning/--success/--info`, radii 6/10/14/18px, sidebar 256px, content max 1440px (app) / 1280px container (landing).
- Typography: Inter (Geist Sans fallback). Status must be icon + label, never color alone. WCAG 2.2 AA; motion 150–350ms and meaningful only.
- App shell: fixed black sidebar + white workspace; mobile uses bottom nav (Home, Calendar, Create, Inbox, More). Route map is in `navigation.md` (`/app/:workspaceId/...`).

## Architecture intent (if/when code is added)

`architecture.md` recommends: TypeScript + React server-rendered framework (landing spec says Next.js App Router + Tailwind), PostgreSQL, Redis-compatible queue with isolated workers, S3-compatible storage; modular monolith with domain boundaries (Identity/Tenancy, Content, Publishing, Engagement, Campaigns/Paid, Analytics, Integrations, Collaboration). Every tenant record carries `organization_id` (and `workspace_id` where scoped); timestamps UTC. Publishing must be idempotent with reconciliation before retry. Record major choices as ADRs.

Roadmap phases (`roadmap.md`): 0 Foundations → 1 Plan & publish MVP (Instagram/Facebook/LinkedIn/TikTok as provider approval allows) → 2 Engage → 3 Understand → 4 Promote → 5 Improve.

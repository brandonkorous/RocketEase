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
- **Providers**: `packages/providers` is the adapter contract; `mock` (dev, `PROVIDERS_ENABLE_MOCK=1`) exercises the full connect → select → sync → publish → reconcile loop locally; `meta`/`linkedin`/`tiktok` are real API code, untested live until credentials exist. Tokens are AES-GCM envelopes bound to the row id (`lib/crypto.ts`, `lib/providers.ts`); never log or return them.
- **Jobs**: enqueue only via the transactional outbox (`emit(tx, name, payload)` in `lib/jobs/outbox.ts`); the worker relays. Queue names/payloads live in `lib/jobs/queues.ts`; handlers in `worker/handlers/`. Worker code must not import `server-only` or `next/headers` (use `lib/audit.ts`'s dynamic pattern).
- **Publishing**: `post_variant` state is authoritative; `content_item.status` is a summary (`summarizeItem`). The publish worker revalidates everything first, treats ambiguous provider errors by **reconciling before any retry**, and only retries retryable categories with backoff. Never bypass `idempotencyKey`.
- **Storage**: `lib/storage/` — one API, two drivers chosen by `STORAGE_DRIVER`: `s3.ts` (MinIO locally at :5090, console :5091) and `azure.ts` (Azure Blob in production; Azure has **no** S3-compatible API, so it is a real driver, not a re-pointed endpoint). Browser uploads go straight to storage via presigned PUT; `asset.process` makes renditions and runs the scan hook. Unscanned/expired-rights assets can't publish.
- **Conversion tracking** (`lib/tracking`, `docs/tracking.md`): GA4 / Shopify / signed webhook sources write `conversion_fact` via `tracking.sync`. Site-reported and ad-reported conversions never double-count — a paid `utm_medium` belongs to the ad platform, everything else to the tracking source; ROAS is paid-medium revenue ÷ spend. `lib/tracking/availability.ts` owns every "why is this unavailable" string; never show a missing conversion metric as 0.
- **Inbox**: `packages/providers` inbox contract (`fetchInbox`/`reply`/`findReply`/`inboxItemsFromWebhook`, `inbox-types.ts`). Ingestion is `lib/engagement/ingest.ts` (idempotent on channel+remoteId) fed by `inbox.sync` polling (worker tick every 2 min) and `POST /api/webhooks/[provider]` → `webhook_receipt` → `webhook.process`. Outbound replies are `message` rows in `queued` state delivered by `inbox.reply`; an ambiguous provider result is reconciled with `findReply` before any resend (ENG-003). The mock store lives in the worker process, so local "simulate incoming" goes through the webhook receipt path, never a direct in-process call.
- Local URLs: web :5000, platform :5001, Postgres :5050, Mailpit UI :5026, MinIO :5090/:5091. `pnpm dev` starts all of it including the worker.
- Silica gotchas beyond the web ones: `DropdownMenuLabel` must be inside `DropdownMenuGroup` (Base UI 1.7); portaled popups need `data-theme` + the `[data-base-ui-portal]` z-index rule in `globals.css` to render above the dark sidebar.
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

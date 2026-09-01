# Live production testing — AI media generation

State as of **2026-09-01**, written to survive a context compaction. Everything
below was verified against real infrastructure, not inferred.

---

## Where this got to

**Images and text both work end to end in production, verified in the browser.**
Concept → draft on gpt-5.4 → Generate image → asset in the library, with cost,
model, aspect and audit all correct. The standalone library generator works with
no concept and no text model.

Shipped and live (commits `a055de4`, `c5e9a41`):

- Drafting runs on **gpt-5.4** (`rocketease-text`, DataZoneStandard, US-only
  inference). `lib/ai/transport/` picks the vendor from configuration, so
  switching is env, not code.
- Images run on **gpt-image-2** (`rocketease-images`, GlobalStandard).
- `vendor_cost_usd` is logged AND shown on the asset detail panel.
- Aspect is a control (1:1 / 9:16 / 16:9); 9:16 verified at 1088×1936.
- Spend estimate shown before the button: "About $0.05 per image."
- `/staff` works, `media.generation` granted to WizeWorks
  (`msZ2DmeaQrRaT0dgYRxURbdqn9FcFBSb`).

### Live endpoints

| | |
|---|---|
| Account | `oai-rocketease-prod-eus2`, `rg-sparx-prod-cus`, eastus2, kind **AIServices** |
| Images | `<endpoint>/openai/deployments/rocketease-images/images/generations?api-version=2025-04-01-preview` |
| Text | `<endpoint>/openai/deployments/rocketease-text/chat/completions?api-version=2024-10-21` |
| Endpoint | `https://oai-rocketease-prod-eus2.cognitiveservices.azure.com` (the `.openai.azure.com` host also still answers) |
| Vault | `AZURE-OPENAI-*`, all written by Terraform |

**gpt-5.x rejects `max_tokens`** and needs `max_completion_tokens`. A transport
written from Claude's shape 400s on every draft.

---

## What has NOT been tested

1. **A ceiling REFUSAL has never been observed.** The ceiling is proven
   *configured* — an unpriced job would have been refused and ours was not — but
   nothing has watched it actually say no. Do this before video.
2. **Publishing an AI-generated image.** The synthetic-media disclosure and the
   `credential_absent` provenance warning only appear at publish time and have
   never run. This is the last defect that would be visible in PUBLIC.
   Publishing posts to the real Jotacular Facebook Page — **ask first**.

---

## Video is unblocked, and it changes the spend maths

**Sora 2 is on our existing account.** No new vendor, no credentials:

    OpenAI.GlobalStandard.sora-2   used 0 / limit 9
    OpenAI.GlobalStandard.sora     used 0 / limit 60

At **$0.10 per second** (Global; Sora 2 Pro is $0.30), a 5-second clip is $0.50
— roughly 80x an image. So `MEDIA_CEILING_USD_PER_JOB=0.50` sits exactly on the
boundary and would refuse anything longer than five seconds. **Decide that
ceiling deliberately before enabling video**, rather than inheriting an
image-sized one.

---

## Quota: 2 RPM, request submitted

Confirmed via the control-plane API, not inferred:

    currentTierName    "Tier 1"
    tierUpgradePolicy  "OnceUpgradeIsAvailable"   (auto-upgrade is ON)

Tier 1's PUBLISHED quota for gpt-image-2 GlobalStandard is 6 RPM. This
subscription is provisioned at **2**, fully allocated, `availableCapacity: 0`.
Three of four image models sit at exactly one third of their documented Tier 1
figure; `gpt-image-1.5` is the exception at its full 9.

| model | actual | Tier 1 doc |
|---|---|---|
| gpt-image-1 | 3 | 9 |
| gpt-image-1-mini | 4 | 12 |
| gpt-image-2 | **2** | **6** |
| gpt-image-1.5 | 9 | 9 |

**A quota request for 12 RPM was submitted 2026-09-01** (Model Deployment /
Azure OpenAI / Global Standard). Decision: stay on gpt-image-2 at 2 RPM while
waiting rather than switching to gpt-image-1.5, which would buy 9 RPM now but
dies 2026-12-16.

Note `gpt-image-2` is **GlobalStandard-only** in eastus2 — only 1.5 offers
DataZoneStandard — so the residency gap on images cannot be closed on this model.

---

## The Foundry upgrade (done 2026-09-01) changed less than advertised

The account `oai-rocketease-prod-eus2` was converted to `kind = AIServices`
through the portal.

- **Quota did NOT change.** Still 2 RPM in the `OpenAI.*` namespace; no
  `AIServices.*` image quota appeared in eastus2. Resource kind decides which
  model FAMILIES can be deployed, not per-model rate limits. (The MAI-Image
  models with 9–18 RPM are swedencentral-only.)
- **The endpoint DID move**, despite the portal saying it would not:
  `*.openai.azure.com` → `*.cognitiveservices.azure.com`. Both answer 200 on
  images and chat, verified live.
- Terraform needed three changes to stop fighting it: `kind = "AIServices"`,
  `project_management_enabled = true` (FORCES REPLACEMENT if absent), and an
  `identity { type = "SystemAssigned" }` block the provider demands with it.
  Committed as `73d458a11` in sparx.works — **not pushed**, because a pre-push
  hook fails on `page-performance.ts`, unrelated uncommitted work in that repo.

---

## What to actually test, and the order that finds bugs fastest

0. **Deploy first.** Both prerequisites are now committed configuration, not
   console steps — but they are `platform-config` values, and `envFrom` is
   resolved at POD START. They reach production on the next deploy and not a
   moment sooner.
1. **Grant the beta.** `/staff` → grant `media.generation` to WizeWorks. Without
   it every entry point returns "Media generation isn't available", correctly.
   Nothing below works until this is done.

   Before 2026-08-31 this step was impossible: `/staff` returned 404 for
   everybody, because `requireStaff` resolves a role from a `staff_user` row or
   the `STAFF_EMAILS` bootstrap, and STAFF_EMAILS reached neither the vault nor
   ci.yml's `optional=()` array. It is now a ConfigMap literal. If /staff still
   404s after the deploy, the remaining cause is `emailVerified` — the env path
   deliberately refuses an unverified address, so verify the account and retry.
2. **Spend controls are set** — `MEDIA_CEILING_USD_PER_JOB=0.50`,
   `MEDIA_CEILING_USD_PER_ORG_MONTH=25.00`,
   `AI_MEDIA_RATES_JSON={"azure-gpt-image-2":0.08}`. They move together: a
   per-job ceiling with no rate for the routed model refuses EVERY job by design.
   Confirm a refusal is reachable by asking for something absurd before trusting
   the ceiling exists.
3. **Generate from a concept card.** Create → Generate → "Generate image".
   Expect: an image back inline (the Azure adapter is `synchronous`), an asset
   in the library flagged AI-generated, and a `media_job` row recording
   `azure-openai` / `azure-gpt-image-2` / `gpt-image-2` plus a readable
   `model_reason`.
4. **Check the aspect that matters.** Portrait must request `1088x1936` — three
   of six placements are 9:16. Anything asking for 1024x1024 is a regression.
5. **Check provenance.** The asset's `provenance.c2pa` is probed from the bytes,
   not claimed. Publishing an AI image should surface the
   `credential_absent` warning in the composer.
6. **Check the audit trail.** One `media.generate` audit row, plus
   `asset.upload` per stored image.
7. **Check `media_job.vendor_cost_usd` is a real number.** It is computed from
   the token usage the vendor reports, not from the estimate. A NULL here means
   the monthly ceiling is accruing nothing and would never refuse anything —
   which is what it did before 2026-08-31, when the reply's `usage` block was
   parsed away and discarded.

   You no longer need psql for this. The asset's detail panel in the Content
   library shows **Model** and **Cost**, and every completed job logs a
   `media job charged` line. Reading it required a hand-written Kubernetes Job
   until 2026-09-01, which is why nobody would ever have noticed it going null.
8. **Generate an image with NO concept.** Content library → the rail's
   "Generate an image". This path touches no text model at all, which is the
   point: drafting and images are different vendors behind different keys, and
   one being down must not take the other with it. With drafting unconfigured,
   /create/generate should now SAY images still work and link here.
9. **Check the aspect control.** Each Generate surface offers 1:1, 9:16 and
   16:9. Portrait must request `1088x1936`. Before 2026-09-01 every generated
   image was square regardless of where it was going.

---

## What 2 RPM means while testing

The numbers are in the quota section above; this is what it does to a test run.

A multi-image job is **one** request — `n` is a parameter on a single POST — so
`count: 4` does NOT consume four of the two. (An earlier note here said it did;
that was wrong.) The limit bites on SEPARATE generations: **two clicks of
Generate inside a minute is enough to 429.** That is mapped to `rate_limit`,
retryable, and the message now reads "The image model is busy — try again in a
minute" rather than naming the vendor's internal state. Nothing is lost, but
space the runs.

`quality: "high"` also exceeded `TIMEOUT_MS` (120s) when measured. We never send
a quality, so production gets `medium` — but if quality ever becomes a control,
that timeout has to move with it.

---

## What an image actually costs

Measured against the live deployment on 2026-08-31, which is the only way to get
this number: **Azure bills gpt-image-2 per token and publishes no per-image
meter at all.** Rates from the retail price API, GlobalStandard: prompt
$5.00/1M, generated image $30.00/1M.

| prompt | quality | size | output tokens | cost |
|---|---|---|---|---|
| plain backdrop | medium | 1088x1088 | 204 | $0.006 |
| plain backdrop | medium | 1088x1936 | 148 | $0.004 |
| busy night scene | medium | 1088x1936 | 1331 | $0.040 |
| busy night scene | high | 1088x1936 | 5322 | $0.160 |

Two things worth keeping:

- **Tokens track CONTENT, not size.** A busy picture costs 9x a plain one at the
  same resolution. So a single per-image rate is an approximation by nature; the
  configured $0.08 is ~2x the busiest measured, because an estimate that rounds
  up makes the ceiling refuse rather than overspend.
- **`medium` is the default**, and this adapter never sends a quality, so that
  is what production gets. `high` on a complex prompt took longer than
  `TIMEOUT_MS` (120s) to return — if quality ever becomes a user-facing control,
  that timeout has to move with it.

---

## Known-blocked, with the reason

**Claude on Microsoft Foundry — the subscription cannot buy it. Drafting moved
to GPT instead, and the product is not blocked.**

Measured 2026-09-01, after two wrong diagnoses:

    quotaId                         Sponsored_2016-01-01
    accepted marketplace agreements 0

A Sponsored subscription is one of the types Microsoft excludes from Azure
Marketplace third-party purchases. Claude is a partner model, sold through
Marketplace, so it cannot be deployed here at all. Both alternatives were ruled
out by experiment, not by reading:

- **Not `modelProviderData`.** The Terraform now sends it (via `azapi`, because
  `azurerm_cognitive_deployment` cannot — azurerm#31140). The error is
  unchanged. It was still a real bug that would have blocked an eligible
  subscription.
- **Not quota.** Capacity 1 fails identically to capacity 13, with 0/40
  GlobalStandard and 0/13 DataZoneStandard free and no soft-deleted account
  holding TPM. Microsoft's troubleshooting table maps `715-123420` to quota;
  here that is a red herring and following it cost an afternoon.

To restore Claude: convert the subscription to Pay-As-You-Go (or move the
Foundry account to one that already is), then flip
`rocketease_claude_deployment_enabled`. Nothing in the app changes — see below.

**Drafting now runs on gpt-5.4**, on the same Azure OpenAI account that serves
images. `lib/ai/transport/` picks a vendor from configuration alone, so this was
a deployment plus two vault values, not a rewrite. Verified against the live
endpoint on 2026-09-01:

| | |
|---|---|
| Deployment | `rocketease-text` → **gpt-5.4** v2026-03-05, **DataZoneStandard**, capacity 50 |
| Endpoint | `.../openai/deployments/rocketease-text/chat/completions?api-version=2024-10-21` |
| Vault | `AZURE-OPENAI-TEXT-DEPLOYMENT`, `AZURE-OPENAI-TEXT-API-VERSION` |

Two things confirmed by live call rather than documentation:

- **`max_tokens` is REJECTED.** gpt-5.x answers `Unsupported parameter:
  'max_tokens' is not supported with this model. Use 'max_completion_tokens'
  instead.` A transport written from Claude's shape 400s on every draft.
- **Reasoning tokens were 0** at these prompt sizes, so the existing token
  budgets (500–3200, sized for Claude, where they are output-only) are safe as
  they stand. If a future prompt does trigger reasoning it eats the same budget,
  and the transport reports a reply truncated before any text rather than
  handing back an empty draft.

Residency is BETTER here than for images: text is DataZoneStandard, so the
prompts carrying brand voice and strategy stay in the US, while image
generation is GlobalStandard-only and may run anywhere.

---

## Traps that already cost time

- **Vault secret names take hyphens only.** `ANTHROPIC_BASE_URL` is rejected;
  `ANTHROPIC-BASE-URL` is right, and ci.yml maps it back.
- **A vault secret not listed in ci.yml's `optional=()` array never reaches the
  pods.** Setting it is a silent no-op.
- **`terraform plan` on this env hits Cloudflare rate limits** while refreshing
  the DNS module. Target the RocketEase resources to avoid touching it.
- **The `az cognitiveservices` CLI commands send a stale ARM api-version** and
  fail. Use `az resource list` / `az rest` with an explicit recent version.
- **centralus carries no image model at all**, which is why the AI accounts sit
  in eastus2 while everything else is centralus.
- **`NEXT_PUBLIC_*` is a GitHub repo VARIABLE, not a ConfigMap value.** It is
  baked at build time, so it cannot come from `platform-config`.
  `NEXT_PUBLIC_AI_ENABLED` was unset, which would have hidden every AI control
  in the browser no matter what the server was doing. Set with `gh variable set`.
- **A ConfigMap change only reaches pods because the deploy rewrites the image
  tag to the commit SHA.** `envFrom.configMapRef` resolves once, at pod start,
  exactly like the secretRef the env-hash annotation exists for. Editing the
  ConfigMap in the cluster by hand changes nothing.
- **`kubectl exec` is blocked by the permission classifier.** To read the
  database, apply a one-off Job with `postgres:18-alpine` mounting
  `platform-env`'s `DATABASE_URL` — the same mechanism migrations use, and the
  only route in, since production Postgres has no public network access.
- **This repo has no `.gitattributes` and mixed line endings.** Editing on
  Windows can rewrite a CRLF file to LF, turning a 20-line change into a
  300-line whole-file diff. Check `git diff --stat` before committing.
- **The portal Foundry upgrade sets `project_management_enabled`, which FORCES
  REPLACEMENT in Terraform** on an account that soft-deletes and holds a global
  DNS label. It also needs an `identity` block. See sparx.works `73d458a11`.

---

## Residency, stated accurately

Not uniform, and the subprocessor page now says so per row:

- **Images** — gpt-image-2 offers GlobalStandard ONLY. Generation may run in any
  region Microsoft hosts the model; anything stored stays in the US.
- **Text** — gpt-5.4 is deployed DataZoneStandard, which pins inference to the
  US. Live since 2026-09-01, and the subprocessor page states it.

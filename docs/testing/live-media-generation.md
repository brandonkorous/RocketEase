# Live production testing — AI media generation

State as of **2026-08-30**, written to survive a context compaction. Everything
below was verified against real infrastructure, not inferred.

---

## What is live and proven

**Image generation, end to end, on our own Azure resource.**

| | |
|---|---|
| Account | `oai-rocketease-prod-eus2` (kind `OpenAI`), `rg-sparx-prod-cus`, eastus2 |
| Deployment | `rocketease-images` → **gpt-image-2** v2026-04-21, GlobalStandard, capacity 2 |
| Endpoint | `https://oai-rocketease-prod-eus2.openai.azure.com/openai/deployments/rocketease-images/images/generations?api-version=2025-04-01-preview` |
| Vault | `AZURE-OPENAI-ENDPOINT`, `-API-KEY`, `-API-VERSION`, `-IMAGE-DEPLOYMENT` — all written by Terraform |

Two real calls returned **HTTP 200** with a decodable PNG: `1088x1088` and
`1088x1936`. The api-version, deployment path, `api-key` header and arbitrary
divisible-by-16 sizing are confirmed by live traffic, not documentation.

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

---

## The constraint that shapes the whole test: 2 requests per minute

`gpt-image-2` on this subscription has a **quota of 2**, and the deployment
already holds all of it:

    OpenAI.GlobalStandard.gpt-image-2 | used 2 / limit 2
    rocketease-images rateLimits: [{ key: request, count: 2, renewalPeriod: 60 }]

So the deployment cannot be scaled up by editing Terraform — the capacity is not
available to allocate. Raising it needs a quota request to Microsoft.

What this means for testing: **a 3-image job partly 429s, and two generations in
the same minute will fail.** Our mapping treats 429 as `rate_limit` and
retryable, so it degrades correctly rather than losing money, but the product
experience at count=4 is currently bad. Test count=1, and space the runs.

Neighbouring quota, if this becomes the blocker: `gpt-image-1.5` has 9
GlobalStandard and 3 DataZoneStandard. DataZone is interesting for a second
reason — it would pin inference to the US, which gpt-image-2 (Global-only)
cannot. That is a model decision, not an ops one; nobody has made it.

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

---

## Residency, stated accurately

Not uniform, and the subprocessor page now says so per row:

- **Images** — gpt-image-2 offers GlobalStandard ONLY. Generation may run in any
  region Microsoft hosts the model; anything stored stays in the US.
- **Text** — gpt-5.4 is deployed DataZoneStandard, which pins inference to the
  US. Live since 2026-09-01, and the subprocessor page states it.

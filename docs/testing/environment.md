# What is actually deployed

Round 1 tests the sparx AKS `rocketease` namespace. Verified 2026-08-30.

## Health

`GET https://app.rocketease.com/api/health` → `db`, `queue`, `storage` all `ok`.
If a suite fails oddly, check this first — a degraded queue makes every async surface look broken.

## Runtime configuration

Non-secret config is `deploy/k8s/overlays/production/kustomization.yaml`; secrets come from Key
Vault via the CI `deploy` job (`.github/workflows/ci.yml`, the `required`/`optional` arrays).

| | Value | Consequence for testing |
|---|---|---|
| `STORAGE_DRIVER` | `azure` | Uploads go to Azure Blob by presigned PUT. CORS on the storage account must allow `https://app.rocketease.com` and `x-ms-blob-type`, or uploads fail in the browser only. |
| `SMTP_URL` | required, set | Google Workspace relay as `noreply@`, From is the `hello@` group. Real mail is sent. **No bounce handling** — a bounced invite or reset is invisible. |
| `TOKEN_MASTER_KEY` | required, set, hand-managed | Never rotate it during a test round; every stored provider token becomes undecryptable. |
| `CLAMAV_URL` | **optional — assume unset** | See watch-out W1. Scanning is a no-op that reports `clean`. |
| `REPORT_CHROMIUM_PATH` | optional | Unset ⇒ reports render as HTML, no PDF. The UI is supposed to say so. Verify it does. |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | optional | Gates all text AI. |
| `OPENAI_API_KEY` | optional | Gates image generation. The model is a registry entry, not an env var. |
| `STRIPE_*` | optional | Gates Settings → Billing. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | Tracing export; not a user-facing surface. |

## Build-time configuration (the trap)

`NEXT_PUBLIC_*` is inlined into the client bundle **at image build**, from GitHub Actions `vars.*` —
not from Key Vault, not from the ConfigMap. Baked into `apps/platform`:

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_SOCIAL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_AI_ENABLED`

If an AI control or the Google sign-in button is missing, that is a missing repository variable at
build time. It cannot be fixed by editing a secret, and it will not error — the browser just gets
`undefined` and the feature silently never renders.

**`apps/web/Dockerfile` declares no `NEXT_PUBLIC_*` ARGs at all**, so `NEXT_PUBLIC_PRICE_MONTHLY` /
`NEXT_PUBLIC_PRICE_YEARLY` cannot reach the marketing build by any configuration change. The pricing
page falls back to the placeholder in `apps/web/components/marketing/price-cards.tsx`. This is
structural, already logged as **F-001**; confirm the rendered fallback is honest and don't re-file it.

## Providers

| Provider | State | Round-1 expectation |
|---|---|---|
| **Facebook (Meta)** | ✅ **live, user-confirmed 2026-08-30** | The one real end-to-end publish path. Test it hardest. |
| Instagram (Meta) | credentials shared with Facebook | Needs an IG Business account linked to the Page. Try it; record what happens. |
| LinkedIn | code-complete, untested live | Connect will likely fail. **Record, don't block.** LinkedIn CMA needs its own app. |
| TikTok | code-complete, untested live | Same. |
| YouTube / Google Business Profile / GA4 | code-complete | Google Cloud project is in Testing mode; GBP has zero quota. Failure is expected. |
| Pinterest / X | code-complete, untested live | Same. |
| **Mock** | `PROVIDERS_ENABLE_MOCK=1`, local only | **Not enabled in production.** Do not expect it. |

## Publishing to Facebook is public

Round 1 will post to a real Facebook Page. Before running suite 02:

- Use a Page nobody is watching, or set the Page to unpublished/restricted.
- Every publish test writes a real, visible post. Plan to delete them.
- Note that deleting on Facebook does **not** roll back `post_variant` state here; that divergence is
  itself worth observing (see suite 02, PUB-11).

## Async ticks

| Surface | Cadence |
|---|---|
| Outbox relay → worker | near-immediate |
| `inbox.sync` poll | every 2 min |
| `insights.ingest` | every 15 min, 3-day revision tail |
| `quality.check` | nightly |

Nothing on these surfaces is a bug until the interval has passed. See watch-out W6.

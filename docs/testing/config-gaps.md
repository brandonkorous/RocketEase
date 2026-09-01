# Configuration gaps in production

Found during round 1, 2026-08-30. These are **settings, not code** — nothing here is fixed by a
deploy alone. Each row says what breaks while it is unset and what to set.

Secrets live in Key Vault and reach the app through the CI `deploy` job's `optional` array
(`.github/workflows/ci.yml`). `NEXT_PUBLIC_*` is different and is covered in its own section.

## Set these

| # | Setting | Where | While unset |
|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY`, `AI_MODEL` | Key Vault | **All text AI is off.** `/create/generate` says "AI drafting isn't configured". Caption variants, the post and ad generator, repurposing, inbox reply drafts and every brand-kit-grounded prompt are unavailable and untestable (F-015). |
| 2 | `NEXT_PUBLIC_AI_ENABLED=1` | GitHub repo **variable** | Even with a key, AI entry points may not render — this is build-time (see below). Set both. |
| 3 | `CLAMAV_URL` | Key Vault + a ClamAV sidecar | **No malware scanning.** Assets are passed without inspection (F-002). Now recorded honestly rather than as a silent "clean", but the control is still absent. |
| 4 | `OPENAI_API_KEY` | Key Vault | No image generation. |
| 5 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `STRIPE_METER_AI_CREDITS`, `BILLING_*` | Key Vault | Billing is off. Settings → Billing says so clearly, and nothing is charged or gated. Fine for now; required before anyone pays. |
| 6 | `REPORT_CHROMIUM_PATH` | Key Vault | Reports render as HTML with no PDF. The UI is supposed to say so — confirm before a client sees one. |
| 7 | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | Key Vault | No trace export. M0.14 is still open on this. |

## Build-time only — a Key Vault entry will not work

`NEXT_PUBLIC_*` is inlined into the client bundle **when the image is built**, from GitHub Actions
`vars.*`. It cannot be supplied by a ConfigMap, a Secret, or a Key Vault entry. A missing one does not
error: the browser gets `undefined` and the feature silently never renders.

Baked into `apps/platform`: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_SOCIAL`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_AI_ENABLED`.

**`apps/web/Dockerfile` declares no `NEXT_PUBLIC_*` ARGs at all**, so `NEXT_PUBLIC_PRICE_MONTHLY` and
`NEXT_PUBLIC_PRICE_YEARLY` cannot reach the marketing build by any configuration change (F-001). The
pricing page falls back to an honest "Pricing is being finalised" card, which is good copy — so this
is only blocking when you want to publish a number. It needs a code change (ARG + ENV in the
Dockerfile, and the pair added to the `web` build-args in CI), not a setting.

## Optional hardening now available

| Setting | Effect |
|---|---|
| `DB_POOL_MAX` (default 5), `PGBOSS_POOL_MAX` (default 3) | Per-process Postgres pool sizes. The sum across platform (×2), worker and media-worker must fit `max_connections` — see `deploy/README.md`. Added by the F-013 fix. |
| `REQUIRE_ASSET_SCAN=1` | Makes a missing scanner **fail closed**: assets are marked `error` and cannot be published, instead of passing unscanned. Set it once `CLAMAV_URL` exists, so a scanner outage blocks rather than silently waves media through. |
| `DEPLOYMENT_ID` | Stamps the build so a version-skew mismatch during a rolling deploy is identifiable. Recovery itself is handled by the error boundary (F-018). |

## Code hardened around the gaps

Done in round 1, so an unset value fails honestly instead of quietly:

- **Virus scanning** no longer records an uninspected asset as plainly `clean`. It writes an explicit
  "not scanned: no scanner is configured" note, the composer raises a **warning** naming the file, and
  `REQUIRE_ASSET_SCAN=1` turns the whole thing into a hard block. The note also no longer says "(dev)"
  in production.
- **Meta insights** degrade per metric instead of all-or-nothing, and a retired metric is named rather
  than leaving an empty chart.
- **Channel health** folds per-surface sync state in, so a channel that cannot ingest stops reporting
  "All systems go".
- **AI**, **billing** and **reports** already stated their unconfigured state honestly and were left
  as they are.

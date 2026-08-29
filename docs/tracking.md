# Conversion tracking sources

What happens **after** the click. Organic and paid social tell us reach, engagement, and clicks;
a tracking source tells us whether any of that turned into a session, an order, or a deal.

Status: **the code is complete and unit-tested against stubbed HTTP; no GA4 or Shopify
credentials exist, so neither integration has ever run against a live account.** Everything below
describes what the code does, not what has been observed. The webhook source is exercisable
locally end to end with `curl`.

## The three sources

| Kind | API | What it reports | Credentials |
|---|---|---|---|
| `ga4` | Google Analytics Data API v1beta `properties/{id}:runReport` | Daily `sessions`, `keyEvents`, `totalRevenue` by `sessionSource` / `sessionMedium` / `sessionCampaignName` | `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET`, scope `analytics.readonly` |
| `shopify` | Admin GraphQL `orders` | Daily order count and order value, attributed by the order's `customerJourneySummary.lastVisit.utmParameters` | `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`, scopes `read_orders`, `read_marketing_events` |
| `webhook` | our own signed endpoint | Whatever the sender posts: a conversion, optionally with a value | none — a signing secret is minted per source |

A kind without credentials is simply not offered in Settings → Tracking, the same rule the
publishing providers follow.

### GA4 notes

- The **numeric property id** is entered before consent (Admin → Property details → Property ID);
  the Admin API is then read once to get the property's display name and `currencyCode`.
- GA4 renamed `conversions` to `keyEvents` in 2024. The client requests `keyEvents` and, on a
  validation error, retries the same report with `conversions`.
- Only socially attributable rows are kept: the `utm_source` maps to one of our networks, or the
  `utm_medium` is a social medium. Everything else (organic search, email, direct) is dropped at
  ingestion, not at read time.
- Google refresh tokens do not rotate, so a refresh keeps the stored refresh token.

### Shopify notes

- The OAuth grant is **offline** (no `grant_options[]=per-user`), so the token does not expire and
  there is no refresh path.
- `customerJourneySummary` is **protected customer data**. A real app needs Shopify's protected
  customer data approval before that field resolves; without it the query succeeds and every order
  looks un-attributed. That is the single most likely reason a live Shopify source reports zero.
- The callback HMAC is verified over the sorted query string before the code is exchanged, and the
  `shop` in the callback must match the one the connect flow started from.

### Generic conversion webhook

```
POST /api/webhooks/tracking/{sourceId}
x-rke-timestamp: 1800000000                 # unix seconds, must be within 5 minutes
x-rke-signature: sha256=<hex HMAC-SHA256 of "{timestamp}.{rawBody}" with the signing secret>
content-type: application/json
```

Body — one event, or `{ "events": [ ... ] }` (max 500):

```json
{
  "eventId": "crm-9182",
  "occurredAt": "2026-08-10T14:03:00Z",
  "value": 249.00,
  "currency": "USD",
  "count": 1,
  "utm_source": "instagram",
  "utm_medium": "social",
  "utm_campaign": "spring-launch"
}
```

- `eventId` is the dedupe key. Omit it and a hash of the body is used, so an exact replay is still
  deduped — but a sender that posts two genuinely different conversions with identical bodies in the
  same request needs its own ids.
- `value` is optional. Without it the event counts as a conversion with no revenue, and ROAS stays
  unavailable rather than reading as zero.
- The response is `{ received, stored, duplicates }`. Storing an event enqueues `tracking.sync`,
  which recomputes that day's facts from the ledger — events are never added into a fact in place.
- The signing secret is shown **once**, at creation or rotation (Settings → Tracking → Rotate
  secret; the old secret stops verifying immediately). It is sealed with the same AES-256-GCM
  envelope as provider tokens, bound to the source row id, and never returned again.

## Data model

- `tracking_source` — one row per connected source. `secret` is the AES envelope (AAD `track:{id}`),
  `config` holds the GA4 property id / Shopify shop domain / window label, `health.hasRevenue`
  records whether the source has ever reported money.
- `conversion_fact` — the daily grain: unique on `(source_id, day, metric, dimension_hash)`, where
  `metric` is `sessions | conversions | revenue` and the hash covers only the UTM triple. A changed
  value bumps `revision`, exactly like `metric_fact`.
- `conversion_event` — the webhook ledger only, unique on `(source_id, event_id)`.

Both fact tables carry `organization_id` + `workspace_id` and cascade on workspace deletion.

## Attribution, and why nothing double-counts

Two systems can see the same click: Meta counts a paid conversion, and GA4 counts the same purchase.
The rule that keeps them additive is the **medium**:

- a row whose `utm_medium` is a paid medium (`paid_social`, `cpc`, `ppc`, …) belongs to the **paid**
  scope, and the ad platform is authoritative there — the tracking source's copy is excluded, in the
  combined scope as well as the paid one (`conversionTotals` drops it before the sum);
- everything else belongs to the **organic** scope and only the tracking source reports it.

So `conversions` = ad-reported paid conversions + source-reported non-paid conversions, with no
overlap. `ROAS` deliberately uses **paid-medium revenue ÷ spend**: dividing all revenue by paid spend
would flatter the number with organic sales.

Every conversion number is shown with its model (`UTM last-click (source-reported)`), the window the
source itself applies, the source name, the currency **as reported** (never converted), and the last
sync time. Mixed currencies are labelled `mixed (…)` rather than summed into a lie.

## Ingestion

`tracking.sync` (singleton per source, `worker/handlers/tracking-sync.ts`) runs hourly from the
worker tick, on demand from Settings → Tracking, and immediately after a webhook delivery.
It re-pulls a **3-day tail** past the last sync because GA4 and Shopify both restate recent days;
the first run reaches back 28 days. Permission and validation failures move the source to
`action_required` with the provider's own message and do **not** retry; anything else throws and
takes the queue's backoff.

## Where the numbers surface

- **Analytics scorecard** — `conversions` and `roas`, with `lib/tracking/availability.ts` supplying
  the exact reason when either cannot be shown (no source / source needs attention / no revenue
  reported / no spend to divide by).
- **Conversion funnel** — reach → engagement → link clicks → sessions → conversions. Sessions come
  from GA4 only; a Shopify or webhook source leaves that step unavailable with a reason.
- **Attribution summary** — a "Site-reported conversions" block next to the paid one.
- **Campaign detail** — the same cards scoped by `utm_campaign` matched to the campaign's
  `tracking.utmCampaign` (falling back to its name). The Performance tab's "Organic vs paid" table
  carries the site-reported conversion count, with the same model / window / source / currency /
  freshness block underneath it.
- **CSV export and scheduled reports** — the conversion rows carry their unavailability reason in
  the file rather than a bare blank, plus a `# conversion_sources` provenance line.

## Local testing

`PROVIDERS_ENABLE_MOCK=1` does not cover tracking; use the webhook source instead.

```bash
SECRET='rke_whsec_...'          # shown once when the source is created
URL='http://localhost:5001/api/webhooks/tracking/<sourceId>'
BODY='{"occurredAt":"2026-08-10T14:03:00Z","value":249,"currency":"USD","utm_source":"instagram","utm_medium":"social","utm_campaign":"spring-launch"}'
TS=$(date +%s)
SIG="sha256=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)"
curl -sS -X POST "$URL" -H "content-type: application/json" \
  -H "x-rke-timestamp: $TS" -H "x-rke-signature: $SIG" -d "$BODY"
```

## Known gaps

- No GA4 or Shopify call has been made against a real account.
- Shopify paging stops at 50 pages (5,000 orders) per window; a busier shop needs a narrower tail
  or cursor persistence.
- `utm_source` resolves to a channel only when the workspace has exactly one channel on that
  network; with two Instagram channels the row stays at workspace level.
- GA4 is queried per property, not per account — one source per property.
- Sources are workspace-scoped; there is no organization-level source shared across workspaces.

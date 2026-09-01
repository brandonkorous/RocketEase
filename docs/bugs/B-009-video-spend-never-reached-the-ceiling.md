# B-009 — Video spend recorded null, so the monthly ceiling never saw it

- **Severity:** P1 — a control that does not control. The spend cap was disarmed for the most expensive thing in the product.
- **Found:** 2026-09-01, on the first video that completed.
- **Status:** fixed.

## What happened

The first successful clip logged this:

```
media job charged  model=azure-sora-2 quantity=4 unit=video_seconds
                   credits=48 costUsd="unknown" assets=1
```

Credits were right. `costUsd` was **unknown**, with the rate plainly configured:

```
AI_MEDIA_RATES_JSON={"azure-gpt-image-2":0.05,"azure-sora-2":0.10}
```

Four seconds at ten cents is forty cents. Nothing computed it.

## Why it matters more than the forty cents

`lib/media/ceiling.ts` accrues the monthly cap by summing that column:

```sql
coalesce(sum(media_job.vendor_cost_usd), 0)
```

A null sums as nothing. So **every video ever generated counted as $0 against
the $25 monthly ceiling** — the one control standing between a runaway loop and
the bill. Images metered correctly, so the cap looked healthy on the exact
traffic that could not exhaust it, and was blind to the traffic that could.

This is precisely the failure CLAUDE.md names — *"a silent null would disarm
it"* — arriving through the door nobody was watching.

## Cause

`finish.ts` wrote the column straight through from the adapter:

```ts
vendorCostUsd: state.usage?.costUsd === undefined ? null : String(state.usage.costUsd)
```

That is right for images: Azure meters gpt-image-2 in **tokens**, and the
adapter converts them to dollars, so the figure arrives already computed. Sora
meters **nothing** — the completed video object carries `seconds` and no `usage`
block at all — so `costUsd` was always undefined and the column was always null.

The rate existed. The quantity existed. Nobody multiplied them.

## Fix

`lib/media/vendor-cost.ts` — one rule, DB-free so it is testable:

- a dollar figure the vendor reported wins, always, and is never recomputed over
- otherwise, **reported quantity × configured rate**
- null when either is missing — never 0, which is the whole bug

Sora bills per second, so seconds × rate is not an estimate of the invoice, it
*is* the invoice. This is the same shape as the image path's tokens × token
rate, which is why it belongs here rather than in the adapter: rates are
deployment config, and an adapter has no business reading them.

The quantity used is the one the **vendor echoed back**, never the one we
requested — a clip that comes back shorter than asked for is billed at what
arrived.

## The row already recorded

One job (`35dbd5f7`, 4 seconds) carries a null cost. It is not lost: `quantity`
and `unit` were both recorded, so it is re-priceable at any time — the same
reason B-004 insisted on keeping tokens rather than only dollars. It is $0.40
against a $25 monthly cap, and it is left alone rather than hand-edited in
production.

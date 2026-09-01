# B-004 · P2 · The image estimate shows the ceiling's safety rate, ~8x the real cost

**Status** partially fixed 2026-09-01 — reads "Up to $0.05" instead of "About $0.05", which stops it overstating. The real fix (estimate from recorded vendor_cost_usd) is still open.
**Found** 2026-09-01, live — Content Library said "About $0.05 per image" beside an
asset whose recorded `vendor_cost_usd` was **$0.0060**.
**Where** `apps/platform/lib/media/estimate.ts`, `AI_MEDIA_RATES_JSON`

## Symptom

One number is doing two jobs. `AI_MEDIA_RATES_JSON={"azure-gpt-image-2":0.05}` is
deliberately rounded **up** past the busiest image measured ($0.040), so the per-job
ceiling errs toward refusing. The library then shows that same number to the author as
"About $0.05 per image".

Measured against this deployment, medium quality: $0.004 plain, $0.040 busy, $0.0060 and
$0.0154 on the two real generations. So the estimate overstates a typical image by
roughly 8x.

## Why it matters

Rounding up is right for a ceiling and wrong for an estimate. An author deciding whether
to generate four variants is told $0.20 when it will cost about $0.03. Being wrong in the
cautious direction is still being wrong, and it teaches people to distrust the figure.

## Fix

Separate the two. Keep the configured rate as the ceiling's safety rate. Derive the
displayed estimate from what this deployment has actually been charged — `media_job.
vendor_cost_usd` is recorded on every completion now, so a median over recent jobs for
the routed model is available and self-correcting.

Fall back to the configured rate when there is no history yet, and say which it is —
"about $0.01 per image, from your last 20" reads differently from a list price.

## Verification

Library estimate tracks observed cost after a handful of generations; a fresh workspace
with no history still shows a figure rather than nothing.

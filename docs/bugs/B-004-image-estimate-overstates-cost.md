# B-004 · P1 · Generation was unmetered, priced in the wrong unit, and threw away the measurement

**Status** fixed and verified live 2026-09-01 (`c2e87a5`, `2e4379b`)

**Verified** asset panel reads "Credits 0.26" (not dollars); the estimate reads "About 0.26
credits per image, from your recent generations" and was ABSENT beforehand, when no job had
credits yet — it quotes history or nothing. `/staff` shows "Our spend (month) $0.07".
Settings → Billing counts "Generated images · 1 request · 0.26" beside "Generated posts".
**Found** 2026-09-01. Originally filed as "the estimate is ~8x the real cost". That framing
was wrong, and the user said so: the problem was never precision, it was the **unit**.
**Where** `lib/media/finish.ts`, `lib/media/estimate.ts`, `db/schema/media.ts`,
`components/library/detail-panel.tsx`

## What was actually wrong

Three things, found by comparing media generation against how text drafting already works.
Text was right; media was the outlier.

| | Text drafting | Media generation (before) |
|---|---|---|
| Tokens stored | yes | **no** — captured, then discarded |
| Credits charged | yes | **no** — free to the customer |
| Shown to the customer | credits | **vendor dollars** |

**1. We showed customers our cost of goods.** The Content Library is workspace-scoped, and
it displayed `$0.0076` — what *we* pay Azure. That hands over our margin and anchors a
price before we have set one. Drafting never did this; it shows credits.

**2. We threw the tokens away.** The transport captured input/output tokens, multiplied by
a configured rate, stored the dollars and dropped the counts. Dollars are *derived*; tokens
are the measurement. When the rate turned out to be wrong — $0.05 configured against
$0.0076 actual — nothing could be recomputed, because the reading was gone. Same principle
as ffprobe: probe, never believe.

**3. Generation was not billed at all.** No credits consumed. Free to the customer, pure
cost to us. Defensible while it sat behind a beta grant; not defensible for long.

The original "estimate is 8x off" complaint was a symptom of #1. The estimate was quoting
`AI_MEDIA_RATES_JSON`, which is the **ceiling's safety rate** — deliberately rounded up past
the busiest image measured so a spend limit errs toward refusing. That is correct for a
limit and wrong for a quote, but chasing a more accurate *dollar* figure would have been
polishing the wrong thing.

## Fix

- `media_job` gains `input_tokens`, `output_tokens`, `credits`. `MediaUsage.tokens` carries
  them out of the adapter instead of being dropped.
- `completeMediaJob` writes to the **same `ai_usage` ledger** with the **same `creditsFor()`
  formula** as drafting, under a new `generate_image` kind. One ledger, one formula, so a
  credit means one thing across the product. Null when the vendor reported no tokens — a
  job we cannot measure is not one we may invent a charge for.
- The library detail panel shows **credits**; "Not billed" is said out loud.
- Vendor dollars move to `/staff` as a per-org monthly total. Moving them off the customer
  screen would otherwise have deleted the only place spend was readable, which CLAUDE.md
  requires — so the requirement is met for the right audience rather than dropped.
- The estimate now reports the **median credits per image from this workspace's own recent
  generations**, and says nothing at all when there is no history. Self-correcting, and it
  never quotes a rate as though it were a measurement.

## The decision this does NOT make

Applying the existing credit formula (1 credit = 1,000 output tokens, input at a fifth) to
image tokens is the honest reading of the definition, but the economics differ: image output
tokens cost us $30/M against text's $16.50/M, so an image credit costs us roughly 1.8x a
text credit. That is a **pricing decision**, not an engineering one, and it is deliberately
left alone rather than quietly baked into a per-model multiplier.

## What this broke on the way through

Routing metering through `lib/ai/usage/record.ts` pulled its `server-only` marker into the
worker, which killed it at startup. The symptom was an e2e **inbox** failure — `channel.sync`
never ran, so the panel that test waits on never appeared. Nothing pointed at media. Fixed in
`2e4379b`, with `worker/imports.test.ts` now walking the worker's import graph so the rule in
CLAUDE.md is enforced rather than merely written down.

Sharing the meter also made an existing line of copy wrong: it said a credit is "1,000 words
of generated text", which images do not produce. Now "1,000 tokens of generated output, text
or image".

## Verification

Generate an image; the library shows credits, not dollars. `/staff` shows the org's monthly
vendor spend. `media_job` carries the token counts. The Settings usage meter counts
"Generated images" alongside drafting. A workspace with no history shows no estimate.

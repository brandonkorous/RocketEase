# Generation-product competitors — Runway, OpenArt, DaVinci AI, Creatify

Researched 2026-09-01, five independent web passes; every claim carries its source. Companion to
`ai-media-2026.md` (the model/supply landscape) — this file is the **demand side**: what the
generation products people actually pay for do, what they charge, what their customers say, and how
close RocketEase can get on quality and cost. The README rule applies: vendor statistics here are
directional and must not appear in product or landing copy without primary verification.

Goal stated by the user (2026-09-01): compete with these products — build a much bigger generation
product than the current image + video generator.

---

## 0. Urgent, verified, and not about competitors at all

**Our only video model is being retired.** Confirmed on the primary pages, not just aggregators:

- OpenAI shuts down the **Videos API and every sora-2/sora-2-pro version on 2026-09-24**, no
  replacement listed. (developers.openai.com/api/docs/deprecations)
- Azure AI Foundry retires **sora-2 (2025-12-08) on 2026-10-15**, replacement "—"; the earlier
  2025-10-06 version is already gone. (learn.microsoft.com Foundry model-retirement-schedule)
- Safe: **gpt-image-2 on Azure is GA to 2027-10-21**. Watch: **gpt-4o-mini-tts version
  2025-03-20 (Preview) retires 2026-10-15**; the 2025-12-15 GA version runs to 2027-06-15 — check
  which version the Azure deployment pins.

So `azure-sora-2` has about six weeks. Whatever else this document decides, the registry needs a
replacement video route before mid-October. §10 has the recommendation.

---

## 1. The four at a glance

| | Runway | OpenArt | DaVinci AI (HubX) | Creatify |
|---|---|---|---|---|
| Shape | Frontier lab + full creative suite | Multi-model workflow studio | Consumer model-aggregator app | AI ad agent (URL → ready ad) |
| Own models? | Yes (Gen-4.5, Aleph, Act-Two, GWM-1) — **and now resells rivals'** | No — 100+ rented | No (one house-branded wrapper) | One (Aurora avatar model); rest rented |
| Scale | ~$300M ARR, $5.3B valuation (Feb 2026 Series E) | ~$70M ARR, 8M MAU, ~20 people, profitable | 10M+ Android installs, "100M creators" claimed | $9M ARR @ 18mo, 18k brands, $15.5M Series A |
| Entry price | $15/mo (625 cr) | $14/mo (4,000 cr) | $39.99/mo (5,000 cr) | $39/mo (100 cr) |
| Trustpilot | **1.1/5** (314) | 3.9/5 (25% 1-star) | 4.5/5 web, **3.6 Play Store** | 4.0/5 (16% 1-star) |
| Publish/measure loop | No | No | No | Partial (ad launch + analytics) |

Sources: sacra.com/c/runway, sacra.com/c/openart, sacra.com/c/creatify, businesswire.com
(Creatify Series A, 2025-05-28), canaan.com (OpenArt Series A, Jan 2026), news.crunchbase.com
(Runway Series E), the products' live pricing pages, trustpilot.com per product.

---

## 2. Runway (runway.com)

**What**: "world-model company" selling an end-to-end video suite — generation (Gen-4.5 T2V/I2V,
5/8/10s, 1080p, native audio since Dec 2025), **Aleph 2.0 / Edit Studio** (instruction-based edits
to real footage: remove objects, relight, change outfit/backdrop/time-of-day, reshoot product),
**Act-Two** performance capture, lip-synced dialogue, real-time conversational avatars (GWM-1),
node-based Workflows, storyboarding, Runway Agent (conversational creation), MCP. Enterprise deals:
AMC, Lionsgate, Gen-4.5 embedded in Adobe's suite. (runway.com/product; eweek.com; techcrunch.com)

**The 2026 tell**: Runway's app and API now also host **Kling 3.0, Seedance 2.5, Seedream 5.0,
Nano Banana Pro, GPT Image 2, Wan 3.0** — the frontier lab became an aggregator. Routing across
vendors is now what the *leader* does, which is exactly `docs/media-models.md` §1's premise.

**Pricing**: Free 125 cr → Standard $15/625 → Pro $35/2,250 → Max $95/9,500. Gen-4.5 costs 60 cr
per 5s (12 cr/s — numerically identical to our own 12 credits/s). **API: $0.01/credit flat** —
Gen-4.5 $0.12/s, Gen-4 Turbo $0.05/s, Aleph 2.0 $0.28/s, image Turbo $0.02.
(runway.com/pricing; docs.dev.runwayml.com/guides/pricing)

**Complaints**: Trustpilot 1.1/5. Failed generations ("internal error") still burn credits;
analysts tell buyers to budget 10–30% waste. One 26s video consumed a full month's Standard
credits. Refund/cancellation hostility; queue waits on paid tiers; quality ceiling now behind
Veo 3.1 and Kling 3.0 while winning on workflow. (trustpilot.com/review/runwayml.com; checkthat.ai)

## 3. OpenArt (openart.ai)

**What**: one subscription over 100+ rented models plus a workflow layer that is the actual
product: editing canvas (inpaint, outpaint, restyle, 4K upscale, vector), **Character Builder**
(consistent faces across scenes), **One-Click Story** (sentence → ~1-minute arc'd video; the 2025
"brainrot" wave), Director chat tool, LoRA training (500 images), voice clone + music, community
remix, MCP. No public REST API. Models tracked within days of release: Seedance 2.5, Kling 3.0,
Sora 2, Veo 3.1, Nano Banana 2, GPT Image 2, Qwen, Recraft V4… (openart.ai/pricing; techcrunch.com
2025-08-08; sacra.com/c/openart)

**The 2026 tell**: **~$70M ARR with ~20 people and zero owned models.** Aggregation + workflow +
SEO landing pages per use case monetizes at ~$3.5M revenue per employee. The moat they chose is
characters/stories, not weights.

**Pricing**: Starter $14/4,000 cr ("~50 videos" — but a 5s Kling clip is ~500 cr and Veo 3 ~1,500,
so the real Starter yield on premium models is ~8 clips) → Plus $34/12,000 → Pro $56/24,000 →
Wonder $240/106,000. Monthly credits expire at cycle end; only add-on packs roll over. Commercial
use starts at Plus. (openart.ai/pricing; checkthat.ai)

**Complaints**: advertised video counts assume cheap models; failed renders still charge; credits
expire; strict no-refund; moderation false positives; no pre-generation cost display.
(trustpilot.com/review/openart.ai)

## 4. DaVinci AI (davinci.ai — HubX)

The user's "davingi.ai" resolves here: web + mobile "AI Creative Studio" by Turkish app studio
HubX. (Runners-up checked and rejected: the CodeCanyon "Davinci" script, Blackmagic Resolve.)

**What**: consumer aggregator — text/image-to-image and -video across Sora 2, Veo 3.1 Fast,
Kling 2.6, Nano Banana, Seedream 4.5, Grok Imagine, Flux; editing (upscale, background swap,
relight); tattoo/logo/avatar generators. Audio "Soon". No API, no publishing, no brand tooling —
it stops at the asset. (davinci.ai; techloy.com)

**Pricing**: Max $39.99/5,000 cr → Ultimate $99.99/15,000 → Creator $199.99/40,000 (annual
billing); mobile IAPs differ; pricing churns so much their help center says checkout is the only
source of truth. Non-refundable. (davinci.ai; help.davinci.ai)

**Complaints**: the mobile-app pattern at its worst — $1.99-trial-to-$69/mo billing traps,
unauthorized charges, bot-only support, credits gone after one video. Play Store 3.6/5 across
185k reviews vs a curated 4.5 Trustpilot. (trustpilot.com/review/davinci.ai; techpoint.africa)

**Read**: not a product to emulate — a warning label. It monetizes opacity; it is also proof that
pure aggregation with no workflow is a race to the app-store bottom.

## 5. Creatify (creatify.ai)

**What**: closest to our lane. Paste a product URL → script → AI actor → edited, ready-to-run
video ad. 300–1,500+ stock avatars, custom avatars from a photo, product-in-hand shots, batch of
50 variants, Ad Cloner, node-based Ad Flow editor, Model Playground (Veo 3, Sora 2 Pro, Kling,
Seedance, Wan), and — the part nobody else has — a **performance loop**: launch to Meta/TikTok/
YouTube/Snap/Amazon, My Ads analytics, Performance Agent, competitor tracking, and a 2026
multi-agent "Creatify Agent" trained on 15M+ ads and $1B+ tracked spend that locks verified brand
names/logos as constraints. Customers include Comcast and Alibaba.com. (creatify.ai; prweb.com;
sacra.com/c/creatify)

**The 2026 tell**: their in-house **Aurora** avatar model (photo + audio → gesturing, lip-synced
talking video) is *itself for rent* — $0.10/s at 480p, $0.14/s at 720p on fal.ai, licensed into
ElevenLabs and Artlist. Even the one genuinely proprietary asset in this cohort is available to us
as an API. (creatify.ai/introducing-aurora; fal.ai)

**Pricing**: Free ~10 cr watermarked → Starter $39/100 cr → Pro $99/300 cr (custom avatar slots)
→ Enterprise. Avatar video 5 cr per 15s, but premium-model renders reported at 48–89 cr per 15s
with no upfront estimate. **Credits expire after 2 months.** API from $99/mo.
(creatify.ai/pricing; help.creatify.ai; apis.io)

**Complaints**: G2 4.8 for ease-of-use; Trustpilot 4.0 with 16% 1-star driven by cancellation
mazes, surprise renewals, no refunds, opaque premium-model credit costs, charged failed renders,
lip-sync degrading on long/non-English videos. (trustpilot.com/review/creatify.ai; g2.com)

---

## 6. The complaint pattern — one wound, four products

Independently, all four earn the same five complaints. This is the market's open wound, and every
item is a **policy choice, not a technical feat**:

1. **Failed or bad generations still burn credits** (Runway, OpenArt, Creatify, DaVinci).
2. **No cost shown before the button** — premium models quietly cost 10–90× the advertised unit.
3. **Credits expire** (OpenArt monthly, Creatify 2 months) — paid value is confiscated.
4. **Cancellation and refund hostility** — the dominant 1-star driver on every Trustpilot page.
5. **Advertised yields assume the cheapest model** ("~50 videos" ≈ 8 real ones).

Our stack already takes the opposite position mechanically: honest `{ unknown }` estimates,
`reconcile()` before any re-spend, tokens kept so cost can be recomputed, credits on one readable
ledger. The productization of that stance is cheap and marketable: **estimate shown before every
generation, failed jobs never bill, credits don't expire, cancel in one click.** None of the four
can copy it quickly, because their revenue depends on the opposite.

## 7. What "much bigger" means — the honest feature gap

What they have that we lack (beyond raw generation, which §8 shows is rentable):

| Capability | Who has it | Gap for us | Note |
|---|---|---|---|
| Avatar / UGC-style spokesperson ads | Creatify (Aurora), Runway (Act-Two, avatars) | **Rent it**: Aurora on fal $0.10–0.14/s; consent gate already designed (`voice` table) | High demand in our exact segment |
| Character/subject consistency across scenes | OpenArt, Runway, all frontier models | Medium — reference-set plumbing exists (`ReferenceSet`), needs UI + `sequence` routing | M12.5 territory |
| Edit real footage by instruction | Runway Aleph 2.0 only | **Rent it**: Aleph API $0.28/s; `footage_edit` JobKind already defined | Unique; nobody else has it either |
| One-click story / URL-to-ad | OpenArt, Creatify, DaVinci | Small — our `AdPlan` pipeline IS this, minus the one-button packaging | Ours is brand-anchored; theirs is generic |
| Editing canvas (inpaint/outpaint/restyle/upscale) | OpenArt, Runway, DaVinci | Large UI build; models rentable ($0.01–0.08/op) | Phase after core generation |
| Model marketplace breadth (50–100+ models) | OpenArt, DaVinci | Deliberate non-goal — we route ~8 curated models per JobKind with a recorded reason | Curation is the feature |
| Ad performance loop (creative ↔ spend data) | Creatify only | **We are structurally ahead**: publish → insights → `conversion_fact` already flow; theirs is bolted on | The moat per `ai-media-2026.md` §15 |
| Own frontier model | Runway only | Never — and Runway itself now resells rivals' models | Non-goal, validated |

What we have that none of them do: server-enforced tenancy for agencies, brand kit as generation
truth, deterministic type compositing, placement preflight, per-network music clearance, C2PA
handling, consent records, and the publish+measure loop. "Much bigger" therefore means: **add the
missing generation surfaces on rented models, keep the honesty and the loop** — not chase model
count.

## 8. Supply side, September 2026 — what generation costs us

Full detail in the supply pass; the numbers that set our floor (per-unit, API list):

**Video**: Kling 2.5 Turbo Pro $0.07/s on fal (direct Kling std $0.028/s); Hailuo 2.3 $0.045/s
768p; Wan 2.5 $0.05–0.15/s; Luma Ray 3.14 ~$0.06/s 720p; Veo 3.1 Fast $0.15/s, Standard $0.40/s
with native audio (Vertex); Seedance 2.0 from $0.067/s (BytePlus) to $0.30/s 720p (fal); Runway
Gen-4.5 $0.12/s, Aleph $0.28/s; Aurora avatar $0.10–0.14/s.

**Image**: gpt-image-2 token-metered (~$0.006–0.05 typical; we measure $0.0154 live); Flux 2 Pro
$0.03/MP (also on Azure Foundry); Ideogram 3.0 $0.03; Recraft V4 $0.04 ($0.08 SVG); Nano Banana
Pro $0.134; commodity SDXL/Schnell ~$0.003.

**Voice**: Azure Neural $16/1M chars (cheapest, integrated); OpenAI mini-TTS ~$0.015/min;
ElevenLabs $0.05–0.10/1k chars.

**A 15–30s social ad, one accepted take**: premium path (Veo 3.1 Standard + Nano Banana + EL voice)
≈ **$10**; mid path (Kling 2.5 + gpt-image-2/Flux + voice) ≈ **$1.60**; budget path (Hailuo/Wan +
Azure voice) ≈ **$1.00**. Our retiring Sora path priced a 20s ad at ~$2.00 — the mid path matches
or beats it at higher quality. Budget 2–3× for rejected takes. The $1.50 per-job ceiling fits mid,
not premium; the ceiling needs a per-tier shape when premium routes land.

**Self-hosting**: not yet. Wan 2.2 on a rented H100 costs $0.084–0.10 per output-second — at or
above fal's API price before ops cost. Images invert (~$0.002 vs $0.03 API) but only at ~1,000+
images/hour sustained. Revisit images first, at volume.

## 9. How close can we get — quality

**Parity on raw generation is a contract away, not a research problem.** OpenArt and DaVinci own
no models; Creatify owns one and rents it out; Runway now resells its rivals. Everyone draws from
the same ~10 frontier models, all API-accessible. Adding the fal adapter (Kling, Seedance, Wan,
Hailuo, Flux, Aurora) and a Vertex adapter (Veo 3.1) puts the same ceiling in our product that
theirs have — the registry, routing, normalization and mock loop are already built and tested.

Where quality is actually decided — product fidelity, legible type, safe zones, brand truth,
variant discipline — we are ahead by design (`docs/media-generation.md` §2), and the competitor
evidence confirms those are the failure modes buyers complain about. The genuinely hard-to-match
surfaces are interactive UI (editing canvas, node workflows) and avatar polish at Creatify's level
of focus; both are phase-2, both sit on rentable models.

## 10. How close can we get — cost

**We can beat their unit economics, because we don't carry their costs.** Runway retails flagship
video at $0.12/s API / ~$0.12–0.29/s in-app; OpenArt's Starter works out to ~$0.35/s on Kling
retail against a ~$0.07/s wholesale cost — a 3–5× markup funding model R&D (Runway), 20-person
margins (OpenArt), or app-store CAC (DaVinci). Routing mid-tier by default (Kling/Hailuo at
$0.045–0.07/s) undercuts our retiring Sora cost ($0.10/s) while raising quality. Our
disadvantages: no volume discounts yet, Azure quota gates, and no in-house model to discount at
the margin — none decisive at our scale. The `creditsFor()` ratio (12 credits/s video) matches
Runway's in-app rate exactly; what remains open is the retail price of a credit, which is
Brandon's pricing decision, now with real market anchors.

## 11. Recommended moves, in order

1. **Now (forced)**: replace `azure-sora-2` before 2026-10-15 — fal adapter with Kling 2.5 Turbo
   Pro as default video route (~$0.07/s, cheaper and better than Sora); verify the
   gpt-4o-mini-tts deployment pins the 2025-12-15 version. gpt-image-2 stays.
2. **Next**: Vertex/Veo 3.1 as the premium `hero_shot` route (native audio, enterprise terms,
   US processing) — the GCP project already exists.
3. **Then, in this order, all on rented models**: URL-to-ad packaging of the existing `AdPlan`
   pipeline (smallest gap, biggest demo); avatar/UGC ads via Aurora behind the consent gate;
   `footage_edit` via Runway Aleph API; character-consistent `sequence`.
4. **Market the honesty**: cost shown before generate, failed jobs never bill, credits never
   expire, one-click cancel — each is a top-3 complaint on every rival's Trustpilot page and each
   is already how the stack works.
5. **Don't**: build models, chase 100-model breadth, ship a consumer editing canvas first, or
   self-host GPUs at current volume.

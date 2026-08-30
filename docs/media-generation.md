# Media generation — architecture and plan

Quality image and video **ad creative**, from brand truth to published post: shots, voice-over,
music, captions, per-network renders, placement preflight, disclosure.

- Model layer — which models, what they return, how they are routed: **`docs/media-models.md`**
- Evidence for every claim here: **`docs/research/ai-media-2026.md`**
- Build order and status: `docs/IMPLEMENTATION_PLAN.md` Milestone 12
- Companions: `docs/tracking.md`, `docs/billing.md`

**Pricing is deliberately out of scope for now** (user decision, 2026-08-29). Cost is *instrumented*
from the first render so it can be priced from measurement rather than guesswork — §9.

---

## 1. Where we are today

The text AI stack is mature. The media stack is one adapter and a stub comment.

**What exists**

| Piece | Where | Shape |
|---|---|---|
| Anthropic completion client | `lib/ai/client.ts` | sync, env-gated, budget-checked before, metered after |
| Post & ad copy generator | `lib/ai/generator/*` | brief → concepts per network + ad sets; partial success is normal |
| Ad field specs | `lib/ai/generator/ad-specs.ts` | per-network copy limits, every number sourced, `verified: false` warns rather than errors |
| Image generation | `lib/ai/generator/images.ts` | OpenAI Images; `ImageGenerator` interface; env-gated |
| Generated images → library | `lib/ai/generator/image-assets.ts` | storage → `asset` row → `asset.process`, flagged `generatedByAi` |
| Brand kit | `lib/brand/*`, `workspace.settings.brandKit` | identity, voice, messaging with dated offers, audiences, compliance rules, **8 logo variants, palette, typography, imagery direction**, brand assets |
| Usage ledger | `db/schema/ai-usage.ts`, `lib/ai/usage/*` | one row per completion; hard cap; Stripe meter |
| Disclosure | `lib/disclosure.ts`, `lib/ai/generator/disclosure.ts` | deterministic; `none`/`assisted`/`synthetic_media` → per-destination plan |
| Asset library | `db/schema/assets.ts`, `worker/handlers/asset-process.ts` | checksum, sharp renditions, ClamAV hook, rights window + scope |
| Job spine | `lib/jobs/outbox.ts`, `lib/jobs/queues.ts` | transactional outbox → pg-boss; per-queue retry policy |

**The five real gaps**

1. **No media pipeline.** `asset-process.ts:45` says it outright: *"Video/document: metadata probing
   (ffprobe) and poster frames come with the media pipeline spike."* A video upload gets a checksum
   and a byte count. No duration, no dimensions, no poster frame. `Capabilities.limits.
   videoMaxSeconds` exists and **cannot be validated against anything**. This is a live defect in
   video *publishing*, before a single frame is generated.
2. **No audio anywhere.** `ASSET_KINDS` is `image | video | document`.
3. **No async generation model.** Every AI call is synchronous inside a server action. Generation
   returns a job id and takes minutes.
4. **Metering is token-shaped.** `ai_usage` has `inputTokens`/`outputTokens` and nothing else.
5. **No provenance beyond a boolean.** `generatedByAi` + `generationModel` is the whole record — no
   C2PA, no watermark note, no chain from a render back to what made it.

---

## 2. The quality thesis

**An ad is not a model call.** Getting quality out of 2026 models is mostly *not* a modelling
problem — it is five problems, and only one of them is generative:

| # | What makes it good | Where it comes from |
|---|---|---|
| 1 | **Brand truth** — right logo, palette, type, tone | The brand kit (M10). Structured, current, per-client. Not prompting |
| 2 | **Product fidelity** — the product does not warp | Real packshot → reference-conditioned edit → image-to-video. Not text-to-video |
| 3 | **Legible offer** — price, claim, CTA correct | Composited deterministically. Never diffused |
| 4 | **Placement fit** — aspect, safe zones, duration, hook by 3s | A sourced spec table and a preflight. Deterministic |
| 5 | **Variation with a reason** — variants differ on one axis | The plan, not the model. Otherwise a test means nothing |

Four of the five are ours and are the moat. One is rented and swappable.

**The scarce input in 2026 is not model access — it is structured brand truth.** Milestone 10
already built the hardest part of it. The point tools cannot: they see one brief, not a client's
standing identity, dated offers, banned words and compliance rules.

The three named failure modes we are designing against, all from the research:

- **Warping** — "shape, texture, or branding of a product changes mid-motion." Defence: fixed
  product reference plus constrained prompting.
- **Wrong text** — models are approximate at type; a price is not a place to be approximate.
  Defence: composite it.
- **Covered creative** — Meta's unified Stories/Reels safe zone is 14% top / 35% bottom / 6% sides;
  a CTA in the bottom third is simply not visible. Defence: preflight against sourced numbers.

And the positioning constraint that does not bend: **AI drafts, a person presses send.** Generated
media lands in the library and in Create as a draft. Nothing generated reaches a network without a
human action.

---

## 3. The pipeline

```
Brand kit + product/reference assets + brief
   │
[1] CREATIVE PLAN      LLM writes an editable AdPlan — structured, never pixels
   │
[2] REFERENCE SET      resolve brand + product assets into model-ready references
   │
[3] SHOT GENERATION    routed per shot to the right model (docs/media-models.md)
   │
[4] ASSEMBLY           deterministic: type, logo, captions, audio mix, aspect variants
   │
[5] PREFLIGHT          placement specs · fidelity · disclosure · music clearance · rights
   │
[6] DRAFT              a person reviews, edits, presses send
```

Stages 1, 2, 4 and 5 are ours. Stage 3 is rented. Stage 6 is the promise.

### 3.1 The creative plan

The model's output is **a plan, not a picture**. An `AdPlan` is JSON a person can read, edit and
re-render for free:

```ts
type AdPlan = {
  objective: Goal;                  // reuses lib/ai/generator/types.ts
  placements: Placement[];          // "meta_reels" | "tiktok_infeed" | "meta_feed_4x5" | ...
  hook: { text: string; onScreenAtMs: 0 };   // by 3s, non-negotiable
  shots: Shot[];                    // each carries a JobKind, references, duration, direction
  overlays: Overlay[];              // type, logo, legal line — composited, with safe-zone anchors
  audio: { voiceover?: VoiceoverPlan; music?: MusicPlan; sfx?: SfxPlan[] };
  captions: { burnIn: true; style: CaptionStyle; language: string };
  variants: VariantAxis[];          // ONE axis per variant: hook | cta | opening frame
};
```

Why a plan: it keeps stage 3 accountable (each shot has a stated purpose and duration), it makes
edits free (changing a headline re-runs a composite, not a $12 render), and it is the only way
variants can differ deliberately rather than randomly.

### 3.2 The reference set

The abstraction the whole 2026 model landscape converges on. Veo calls it *Ingredients*, Seedance
takes 9 images + 3 videos + 3 audio, Nano Banana Pro takes 14, Higgsfield calls it *Soul ID* — same
feature, different branding.

```ts
type ReferenceSet = {
  product?: AssetRef[];     // real packshots. The fidelity anchor
  logo?: AssetRef;          // from the brand kit's 8 variants, picked for the background
  talent?: AssetRef[];      // consent-gated (§7)
  style?: AssetRef[];       // imagery direction from the brand kit
  palette: string[];        // hex, from the brand kit
};
```

`lib/media/references.ts` resolves a `ReferenceSet` and then **downsamples it to what the routed
model accepts** — 3 for Veo, 9 for Seedance, 14 for Nano Banana Pro — with a stated priority order
(product first, always) and a note on the job when references had to be dropped. Silently discarding
the product shot because the model only takes three is exactly the failure this prevents.

### 3.3 Assembly — deterministic, ours, ffmpeg

Trim; crop and pad to each placement; concat; **burn in captions**; composite type and logo from the
brand kit at safe-zone anchors; mix voice-over over a music bed with ducking; normalise to −14 LUFS;
extract poster frames; transcode per network; re-sign provenance.

This is the tier that makes the output *repeatable*: the same plan renders the same file every time.
It is also where DaVinci Resolve's Neural Engine feature list is a useful checklist for later —
smart reframe and voice isolation are solved problems available as libraries, not model calls.

### 3.4 Preflight

Blocking and warning checks before anything can be used, each with a reason string:

- **Placement specs** — new `ad-canvas-specs.ts`, in the same sourced style as `ad-specs.ts`:
  aspect, min resolution, duration bounds, safe-zone insets, sound-on expectation. Meta's unified
  14/35/6 and TikTok's 9:16 ≥720p-with-sound are the first entries. Anything unconfirmed is
  `verified: false` and can only warn.
- **Fidelity** — probed duration/dimensions vs the plan; the `mismatch` list from normalization.
- **Disclosure** — any generated media in the variant makes it `synthetic_media`; the existing
  per-destination plan runs unchanged.
- **Music clearance** — per network, §7.
- **Rights and consent clocks** — the M8.4 model, extended to voices and likenesses.

---

## 4. `packages/media`

A new adapter package, same role and shape as `packages/providers`, for the same reasons: the worker
needs it, the web process needs it, and tests need a mock that touches no network and spends nothing.

```
packages/media/src/
  types.ts        JobKind, GenerationSpec, ModelIO, MediaError (categories mirror ProviderError)
  catalog.ts      the model registry — sourced, pinned, versioned   (docs/media-models.md §4)
  routing.ts      JobKind -> ordered candidates, with a stated reason (§3 there)
  cost.ts         estimate(spec) -> { amount, unit, verified } | { unknown: reason }
  client.ts       browser-safe re-exports: no keys, no node deps
  mock/           deterministic fixtures for every JobKind
  fal/            the breadth adapter — FLUX, Seedream, Nano Banana, Kling, Seedance, Wan
  vertex/         Veo direct — IAM, audit logging, enterprise terms
  runway/         Gen-4.5, Aleph 2.0, Act-Two
  openai/         Sora 2; Images (moved from lib/ai/generator/images.ts, behaviour unchanged)
  elevenlabs/     tts, sfx, music, scribe, dubbing
```

One interface, because every vendor has the same three shapes:

```ts
export interface MediaAdapter {
  readonly key: AdapterKey;
  models(): ModelDescriptor[];
  estimate(spec: GenerationSpec): CostEstimate;              // never guesses; { unknown } instead
  start(spec: GenerationSpec, idempotencyKey: string): Promise<MediaJobHandle>;
  poll(handle: MediaJobHandle): Promise<MediaJobState>;
  fetch(state: MediaJobState): Promise<RawOutput[]>;         // bytes, before the URL expires
  reconcile(idempotencyKey: string): Promise<MediaJobState | null>;  // before ANY re-spend
  parseWebhook?(req: WebhookRequest): MediaJobState | null;
}
```

`start`/`poll`/`fetch` is the honest shape: a sync vendor implements `start` as "do it now" and
`poll` as "already done," and the caller never branches. `MediaError` carries the same
`category`/`retryable`/`ambiguous` triple as `ProviderError`, so the publish-worker discipline
transfers directly — **an ambiguous generation is reconciled before any re-spend**, because a blind
retry on an expensive render is a real bill.

---

## 5. Data model

New in `db/schema/media.ts`; every table carries `organization_id` + `workspace_id`.

**`media_job`** — the missing async spine, one row per generation.

| Column | Notes |
|---|---|
| `job_kind` | the routing unit (`product_motion`, `hero_shot`, `voiceover`, …) |
| `adapter`, `model_key`, `vendor_model_id` | which router, which registry entry, which exact pinned vendor string |
| `model_reason` | **why this model** — shown to the person, kept forever |
| `spec` (jsonb) | the request verbatim — replayable, auditable, diffable |
| `seed` | where the model offers one; makes "three more like this" real |
| `idempotency_key` | unique per workspace; **never bypassed** |
| `state` | `queued` → `running` → `succeeded` \| `failed` \| `cancelled` |
| `remote_job_id` | the vendor's id, for reconciliation |
| `quantity`, `unit` | `8`/`video_seconds`, `1420`/`characters`, `4`/`images` |
| `vendor_cost_usd` | **what it actually cost us.** Null when unknown — never a guessed 0 (§9) |
| `asset_ids` (jsonb) | what it produced |
| `error_category`, `error_note` | user-facing reason, never the raw vendor payload |
| `requested_by_user_id` | nullable; the row outlives the person leaving |

**`asset` additions** — the library stays the one place media lives.

- `ASSET_KINDS` += `audio`. `RENDITION_KINDS` += `captions` (SRT/VTT sidecar), `waveform`.
- `media_job_id` — closes the loop from an asset back to what made it.
- `derived_from_asset_id` — a captioned render points at its source; a 9:16 cut at the 16:9.
- `provenance` (jsonb) — `{ c2pa: "signed"|"stripped"|"absent", watermark: string|null,
  chain: [{ action, adapter, model }] }`.
- `license_source` — `owned` | `stock` | `platform_library` | `ai_generated`.
- `platform_clearance` (jsonb) — `{ meta: true, tiktok: false, youtube: false, … }`. The music trap
  (§7). Publish validation reads it per destination.

Together, `media_job_id` + `derived_from_asset_id` make the whole chain walkable: **which model made
this, from which references, and what it became.**

**`voice`** — workspace-scoped voice and likeness identities. `adapter`, `remote_voice_id`, `kind`
(`stock` | `cloned` | `likeness`), plus a consent block: `consent_person_name`,
`consent_evidence_asset_id`, `authorised_by_user_id`, `authorised_at`, `expires_at`, `scope`
(`organic` | `paid` | `both`). Cloned voices and likenesses are unusable without a complete,
unexpired record. Stock voices need none.

**`caption_track`** — `asset_id`, `language`, `source` (`generated`|`uploaded`|`edited`), `words`
(jsonb, word-level timings), `text`. Renders to a sidecar rendition and to burned-in pixels.

**`AdPlan`** rides on the draft rather than getting its own table at first.

---

## 6. Queues and workers

Added to `lib/jobs/queues.ts`, enqueued only through `emit(tx, …)`:

| Queue | Policy | Why |
|---|---|---|
| `media.generate` | `stately`, `retryLimit: 0` | a spend mutation. The handler decides after reconciliation — the same discipline as `publish.execute` and `promotion.execute`. A blind retry re-spends |
| `media.poll` | `singleton` | drives long vendor jobs with backoff, and **fetches bytes the moment a job completes** — Sora's URLs expire in ~1 hour |
| `media.render` | `stately` | ffmpeg: assembly, caption burn-in, overlays, transcode, loudness, C2PA re-sign |
| `media.transcribe` | standard | Scribe/Deepgram → `caption_track` |

`POST /api/webhooks/media/[adapter]` reuses the existing `webhook_receipt` → `webhook.process` path,
so a vendor callback is durable and replayable exactly like a provider webhook.

**A dedicated media worker.** ffmpeg is CPU-bound and long-running and must not share a process with
`inbox.sync` ticking every two minutes.

- `Dockerfile.worker` gains `RUN apk add --no-cache ffmpeg` (Alpine base already), or a
  `Dockerfile.media` variant if image size matters.
- Its own Deployment in `deploy/k8s/base`, higher CPU/memory, subscribing only to `media.*`.
- An `emptyDir` scratch volume — renders need real disk.
- `MEDIA_MAX_CONCURRENCY` and a per-job wall-clock ceiling. A runaway render dies rather than
  draining the node.

> **Build vs buy.** Shotstack and Creatomate sell JSON-timeline rendering as a service, and are the
> right answer for a team that does not want to operate rendering. We already operate a worker, a
> queue and object storage; ffmpeg is one apt line and one Deployment, it keeps per-render marginal
> cost at zero, and it is the only way to re-sign C2PA. Revisit if render volume outgrows one node —
> the `MediaAdapter` boundary makes it a swap, not a rewrite.

---

## 7. Clearance, consent and disclosure

**Music clearance is the finding nobody ships.** Meta Sound Collection is cleared for Facebook and
Instagram only; TikTok's Commercial Music Library for TikTok only; business accounts cannot use
either general library at all. "One video, five networks" with platform-library music is a licensing
violation on four of them. `platform_clearance` per asset, checked per destination at publish, with
a reason — the same shape as the M8.4 rights clocks. **AI music from a licensed-data vendor is the
only genuinely cross-network-clean bed**, which is the practical argument for generating it.

**Consent** — cloned voices, likenesses and performance-transfer models are off by default and
require a complete, unexpired `voice` record. The vendors' captchas verify the *uploader*, not the
owner; in an agency those are never the same person. Enabling them is an organization-owner action,
audited.

**Disclosure** — `suggestDisclosure()` already derives the flag deterministically from whether media
was generated; it extends unchanged to video, voice-over, music and cloned voices. The model never
decides this.

**Provenance** — every render attaches a fresh C2PA manifest (`c2patool` in the media worker)
asserting the chain: generated by *model X*, type composited, resized to 9:16. Where we cannot sign,
the asset records `stripped` and the composer says so: *"This render lost the AI credentials the
model attached. TikTok and Meta may not auto-label it."* Signing needs a certificate — Key Vault,
set by hand, **not** Terraform-managed, same rule and same reason as `TOKEN_MASTER_KEY`.

---

## 8. Closing the loop

A generated asset carries `media_job_id`; the post carries the asset; publishing already writes
`remote_publication`; insights and `conversion_fact` already flow back. So the lineage exists to
eventually answer **"do generated ads actually perform, and which model and which hook?"** — fed
into the M7 explainable-recommendations surface.

No point tool can answer that, because none of them own the publish and measure sides. It is worth
designing the lineage for now even though the analysis comes much later.

---

## 9. Cost: instrumented now, priced later

Pricing is explicitly deferred. The trap to avoid is deferring the *measurement* too, and arriving at
the pricing conversation with no data.

**Now**

- `media_job.vendor_cost_usd`, `quantity` and `unit` are recorded on every job from the first
  render. Null when genuinely unknown — never a guessed zero, the rule `ai_usage.costUsd` already
  follows.
- `AI_MEDIA_RATES_JSON`, shaped like the existing `AI_PRICES_JSON`, with the same PLACEHOLDER
  discipline: **this repo ships no invented per-second rate for anybody's model.** Unconfigured
  means cost stays null.
- `MediaAdapter.estimate()` returns `{ unknown: reason }` rather than a guess, and the UI says so
  plainly rather than showing a confident wrong number.
- A **hard per-job and per-workspace ceiling** is still needed on day one — not as pricing, as a
  blast-radius limit while the feature is young. It reuses `checkAiBudget`'s refusal shape so the UI
  already knows how to render it.

**Later, from measurement**

The number worth pricing off is **cost per *approved* ad**, not per render — rejected takes are real
cost, and the ratio is the whole economics. After a few hundred real jobs there is a distribution to
look at, per job kind and per model, and the plan-tier and metering conversation can be had against
evidence. Feeding it into the M8.11 agency margin roll-up is the natural home.

The one thing that is already clear enough to design for: **generation cost is orders of magnitude
above text completion** — a single 30s high-tier render is roughly a whole month of a text credit
allowance — so it will not live behind the same soft allowance. That shapes the ceiling, not the
price.

---

## 9a. Beta access — the gate, and what it lets us skip

**Decision (user, 2026-08-30): build it, run it on our own work first, price it from what we
measure.** The feature ships behind a **beta grant** — us at first, then early adopters — and is
used for RocketEase's own marketing before it is offered to anyone.

### Three different gates, and they must not be conflated

This is a fourth kind of "no", and the repo already has three. Keeping them separate is what stops
"you can't do this" from becoming a single mushy code path:

| Mechanism | Question it answers | Scope | Where |
|---|---|---|---|
| `lib/flags.ts` | *Is this capability switched off right now?* | Global, ops, env | existing |
| `lib/billing/entitlements.ts` | *Has this organization paid for it?* | Organization, billing state | existing |
| `lib/authz.ts` `can()` | *Is this person allowed?* | User role in a workspace | existing |
| **`lib/features.ts`** | ***Is this organization in this beta?*** | Organization, product rollout | **new** |

A beta grant is not an entitlement — nothing has been paid for and there is no plan to attach it to
yet. It is not a flag — flags have no notion of who is asking. It is not authorization — the owner of
an organization without the grant is still refused.

### The grant model

Generic from day one, because this will not be the last beta.

**`feature_grant`** (`db/schema/features.ts`) — `organization_id`, `feature` (dotted key, e.g.
`media.generation`), `state` (`enabled` | `disabled`), `granted_by_user_id`, `note`, `expires_at`
(nullable), `created_at`. Unique on `(organization_id, feature)`.

```ts
// lib/features.ts
export const BETA_FEATURES = ["media.generation"] as const;
export type BetaFeature = (typeof BETA_FEATURES)[number];

/** Env bootstrap so the first grant needs no UI: BETA_FEATURES=media.generation:org_a,org_b */
function envGrants(): Map<string, Set<string>> { /* parsed once, cached */ }

/** True when this organization is in the beta. Default is false — betas are opt-in, never opt-out. */
export async function hasFeature(organizationId: string, feature: BetaFeature): Promise<boolean>;
```

Six rules:

1. **Default closed.** No row means no access. A beta that leaks by default is not a beta.
2. **Server-side, at every entry point** — the nav item, the buttons, every server action in
   `lib/actions/media/*`, and the `media.*` job handlers. Hiding a button is not access control; the
   same rule `middleware.ts` already carries.
3. **Granting is audited.** `feature.grant` / `feature.revoke` go through `audit()` like every other
   consequential mutation. Who let this organization in, when, and why is exactly the kind of thing
   the audit log exists for.
4. **The organization is the unit** — media generation spends money, and money is scoped to the
   organization everywhere else (`entitlements`, `billing_subscription`, the agency roll-up).
5. **`expires_at` is available and usually null.** A time-boxed pilot ("30 days, then we talk") is
   the natural shape of an early-adopter deal, and it reuses the rights-clock idiom already in the
   product rather than inventing a second notion of expiry.
6. **The env bootstrap exists for exactly one reason** — granting the first organization before
   there is an admin surface, and local dev. Once the internal admin action exists, rows are the
   source of truth and env is a fallback, not a parallel system.

### What non-beta organizations see

**Absent, not locked** — no teaser, no upgrade prompt, no disabled control with a "coming soon"
tooltip. This is the one place M8.2's "always explain why a control is disabled" rule does *not*
apply, because there is no honest explanation to give for something that cannot be bought at any
price yet. A locked door invites support tickets for a thing that does not exist.

When the beta widens far enough that people are asking for it by name, a waitlist becomes the honest
surface. That is a later decision, not a v1 one.

### What beta-only lets us skip

The constraint is worth more than the gate. A known, small, reachable set of organizations removes a
lot of otherwise-mandatory surface:

| Deferred while in beta | Why it can wait |
|---|---|
| Stripe metering, plan tiers, credit rates | Pricing is deferred on purpose. `vendor_cost_usd` accrues either way |
| Per-workspace allowances and overage | A single hard ceiling per organization covers it |
| Self-serve onboarding for the feature | We can talk to every beta org directly |
| Multi-tenant model policy (`workspace.settings.mediaRouting`) | The registry default is everyone's default for now |
| Public `/capabilities` page for models | Ship it when it is a product, not a pilot |
| Consent flow UI for cloned voices and likeness | Keep those models off entirely in the beta |

What is **not** deferred, because retrofitting it is expensive and because these are the parts we are
trying to learn about: the adapter boundary and registry, output normalization, `media_job` lineage
and cost capture, the reconcile-before-respend rule, provenance recording, and the placement
preflight. Those are the product.

The ceiling is not deferred either. A runaway loop on our own key is still our own money, and it is
the mechanism every customer will eventually depend on — beta is exactly when to find out it holds.

### What the beta is for

Three questions, in priority order, each with a number attached so "we learned a lot" is not the
outcome:

1. **What does an approved ad cost?** Not per render — per *approved* ad, including the takes that
   were thrown away. That ratio is the entire pricing conversation, and only real use produces it.
2. **Which routing choices survive contact?** The table in `docs/media-models.md` §3 is reasoned from
   vendor documentation and comparison testing, not from our own output. Expect it to be wrong
   somewhere.
3. **Where does the pipeline break?** Warping, safe-zone collisions, C2PA loss, duration mismatches.
   Better found on our own brand than on a client's.

**The honest limitation:** our own usage gives excellent cost data and *biased* quality data — one
brand, one taste, one vertical, and a monochrome one at that. Early adopters in different categories
are not just a growth step; they are the thing that makes any routing default trustworthy. Recruit
for category spread, not enthusiasm.

---

## 10. Build order

Five stages, each independently shippable. 12.1 fixes a live defect on its own.

| Stage | Contents | Unblocks |
|---|---|---|
| **12.1 Pipeline foundation** | `feature_grant` beta gate (§9a); ffmpeg in a dedicated media worker; video/audio probe, poster frame, transcode renditions; `ASSET_KINDS` += `audio`; `media_job` + `media.*` queues; `packages/media` with the registry, routing and the **mock adapter**; output normalization; cost instrumentation + hard ceiling; asset provenance and lineage columns | Correct video publish validation (a live defect); everything below |
| **12.2 Static ad creative** | `AdPlan`; `ReferenceSet` bound to the brand kit; `product_still` / `scene_still` via fal; **deterministic type + logo compositing**; `ad-canvas-specs.ts` and the placement preflight; per-placement variants | The highest-quality-per-dollar output, and the compositing and preflight that video reuses wholesale |
| **12.3 Voice & captions** | Scribe/Deepgram → `caption_track` with word timings; burned-in caption renditions + SRT/VTT sidecar; TTS voice-over with stock voices; `voice` table and the consent gate | Accessibility (WCAG 2.2 AA); the lowest-risk generation feature |
| **12.4 Video assembly** | Shot generation routed per `JobKind`; assembly of generated + uploaded footage; audio mix with ducking and −14 LUFS; per-placement aspect renders; plan editing and re-render | "One brief, five placements" as a real, repeatable flow |
| **12.5 Advanced motion & provenance** | Reference-conditioned `product_motion`; `sequence`; `footage_edit` (Aleph); consent-gated `performance`; music generation + `platform_clearance`; C2PA re-signing | The headline capability, last — worthless without 12.1–12.4 |

**Static before video** is deliberate and it is a change from the obvious ordering: static ads are
where the compositing, the brand binding, the placement preflight and the variant discipline get
built and proven, at cents per attempt instead of dollars. Video then inherits all of it.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| **Product warps mid-motion** | Real packshot → reference-conditioned edit → image-to-video; route `product_motion` to the strongest reference model; fidelity check in preflight |
| **A model spells a price wrong** | Type is composited from the brand kit, never diffused |
| **Creative covered by platform UI** | Sourced `ad-canvas-specs.ts` + safe-zone-anchored overlays; preflight blocks with the reason |
| **Expensive render behind an unpriced feature** | Estimate before generate; hard per-job and per-workspace ceiling; `stately` queue with `retryLimit: 0` |
| **Ambiguous vendor result → double spend** | `reconcile()` before any re-spend, the publish rule exactly |
| **Vendor URL expires before we fetch** | `media.poll` pulls bytes into storage the moment a job completes; ~1 hour is the budget |
| **Our pipeline strips C2PA** | Re-sign every render; record `stripped` and warn when we cannot |
| **Cloned voice or likeness without consent** | Off by default; consent record with named person, evidence, authoriser, expiry; owner-level enablement, audited |
| **Cross-network music licensing** | `platform_clearance` per asset; publish blocks per destination; AI music from a licensed-data vendor as the default |
| **ffmpeg starves the worker node** | Separate deployment, own queues, concurrency limit, wall-clock ceiling, scratch volume |
| **Model churn** | Everything behind `MediaAdapter` + the registry; `checkedAt` drift is a data-quality finding; the mock adapter proves the loop with no vendor |
| **Competing with a free tool on its own turf** | Meta Advantage+ Creative is free inside Ads Manager. The angle is cross-network, brand-consistent and honest — not "a better generator for Facebook" |
| **Bad creative ships anyway** | It cannot: generation produces a draft. A person presses send |

---

## 12. Open decisions

Model-layer decisions live in `docs/media-models.md` §11 (primary router, Higgsfield, indemnity
floor, seeds, consent-gated models in v1). Pipeline-level:

1. **Render build vs buy** — ffmpeg in our worker (recommended) vs Shotstack/Creatomate.
2. **Canva interop** — the Connect API can autofill brand templates (text and image fields only;
   colours and fonts are fixed; requires Canva Enterprise). Worth it as an export target for teams
   already on Canva, or a distraction?
3. **C2PA signing identity** — sign as RocketEase, or per-organization. Per-org is more honest and
   more certificate management.
4. **Where `AdPlan` lives** — on the draft, or its own versioned table once plans get reused as
   templates.
5. **Blast-radius ceiling defaults** for 12.1, given pricing is deferred.

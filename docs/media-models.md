# Media models — choices, output types, and how they are managed

The model layer of `packages/media`: which models we call, what each accepts and returns, how one is
chosen for a given job, and how the whole set is kept honest as vendors ship and retire things
monthly.

Pipeline that consumes this: `docs/media-generation.md`. Evidence: `docs/research/ai-media-2026.md`.

---

## 1. The premise: route, don't pick

The 2026 market has already settled this. Higgsfield switches between 8+ video models inside one
project. Runway shipped **Runway Dev** (8 Jul 2026) as *"one API to integrate the best image, video,
audio and real-time character models."* fal.ai runs ~1,000 endpoints behind one surface. Every
comparison writeup lands on the same sentence: the winning move is access to all of them plus
knowing when to use each.

So there is no `AI_VIDEO_MODEL` env var. **A model is chosen per job, from a registry, for a stated
reason, and the reason is recorded.** That is the same discipline as `packages/providers` — declare
the capability, explain the gap — applied to models instead of networks.

Two consequences worth stating up front:

- **We never say "our AI video."** We say which model ran, and the person can see it and change it.
- **A model swap is a routing-table edit**, not a pipeline rewrite. That is the whole point of the
  adapter boundary.

---

## 2. Job kinds — the unit routing is done on

Routing is by **job**, not by media type. "Make a video" is not a routable request; "put this
packshot in motion without warping the label" is.

```ts
export type JobKind =
  // stills
  | "product_still"       // real packshot -> studio/lifestyle still, product unchanged
  | "scene_still"         // background, texture, abstract — nothing brand-critical
  | "typographic_still"   // type-led card. Normally composited, not generated (§6)
  // motion
  | "product_motion"      // packshot -> motion, fidelity is the pass/fail
  | "hero_shot"           // lifestyle/dialogue shot, native audio wanted
  | "sequence"            // multi-shot, one identity held across cuts
  | "broll"               // background motion, nobody inspects it
  | "footage_edit"        // change something inside real footage, keep the rest
  | "performance"         // a reference person delivers a script
  // audio
  | "voiceover" | "music" | "sfx" | "transcribe" | "dub";
```

---

## 3. The routing table

Ordered candidates per job. First configured, permitted and within budget wins. Every number and
capability claim is sourced in the research doc; anything unconfirmed is marked `verified: false`
and can only ever produce a warning, never a silent choice.

| Job | Primary | Why it wins | Alternates |
|---|---|---|---|
| `product_still` | **FLUX.2 [pro]** | 9-image multi-reference, hex-colour precision, predictable across a batch — the brand-work pick | Nano Banana Pro (14 refs, physics-accurate materials), Seedream V4.5 |
| `scene_still` | **Seedream V4.5** | photorealistic, $0.04, generate+edit in one model | FLUX.2, GPT Image 1.5 (cheap tier) |
| `typographic_still` | **composite** | see §6 — a model that spells a price wrong 1 time in 20 is unusable | Recraft V3 (brand palette as a parameter), Ideogram V3 (near-perfect spelling) |
| `product_motion` | **Seedance 2.0** | 9 images + 3 videos + 3 audio as references in one generation; accurate lip-sync; the strongest reference conditioning available | Kling 3.0, Veo 3.1 |
| `hero_shot` | **Veo 3.1** | native audio in one call; Ingredients-to-Video (3 refs); first/last-frame bridging; scene extension past a minute | Sora 2, Seedance 2.0 |
| `sequence` | **Kling 3.0** | the only production-viable 15s multi-shot holding identity, lighting and spatial logic across cuts | Seedance 2.0 (15s multi-shot), Veo 3.1 + scene extension |
| `broll` | **Veo 3.1 Lite** (~$0.03/s) | nobody inspects the background; buy the cheapest that looks right | Kling 3.0 |
| `footage_edit` | **Runway Aleph 2.0** | localized edits to real footage, everything else stable, consistent across cuts. Nothing else does this | — |
| `performance` | **Runway Act-Two** | driving performance + character reference → synthesized delivery. **Consent-gated** (§9) | HeyGen (avatar, also consent-gated) |
| `voiceover` / `music` / `sfx` / `transcribe` / `dub` | **ElevenLabs** | one vendor covers all five; Music is trained on licensed data — the only AI music a client's ad can carry without an open question | Deepgram / AssemblyAI for `transcribe` at volume |

**Two entries carry a product argument, not just a technical one.**

`product_motion` → Seedance over Veo despite Veo's polish, because the named failure mode for
product ads is *warping* — shape, texture or branding drifting mid-motion — and the defence is
reference conditioning, which is exactly where Seedance leads.

`typographic_still` → not a model at all. See §6.

---

## 4. The registry — models as sourced data, not constants

`packages/media/src/catalog.ts`. Same discipline as `packages/providers/src/cost.ts` and
`lib/ai/generator/ad-specs.ts`: every number carries its source, and a number we could not confirm
from the vendor's own documentation is `verified: false` and can only warn.

```ts
export type ModelDescriptor = {
  key: string;                 // "veo-3.1" — ours, stable, appears in media_job rows forever
  adapter: AdapterKey;         // "fal" | "vertex" | "openai" | "runway" | "elevenlabs" | "mock"
  vendorModelId: string;       // EXACT vendor string, pinned. Never constructed at runtime
  jobs: JobKind[];             // what this model is for
  io: ModelIO;                 // §5 — the whole contract
  cost: { unit: CostUnit; amount: number | null; verified: boolean; sourceUrl: string };
  provenance: { c2pa: boolean; watermark: "synthid" | "vendor" | null };
  terms: {
    commercialUse: boolean;
    indemnity: boolean | null;      // null = the vendor does not say. Not the same as false
    trainingOptOut: boolean | null;
    sourceUrl: string;
  };
  reasons?: Partial<Record<string, string>>;  // why this is unavailable right now
  checkedAt: string;                          // when a person last read the vendor's page
  retiredAt?: string;                         // kept forever so old jobs still resolve to a name
};
```

Seven rules the registry exists to enforce:

0. **The same model reached two ways is two entries.** `gpt-image-1` and
   `azure-gpt-image-1` share weights and differ in terms, region and processor, so they are separate
   descriptors with separate keys — a `media_job` that ran on Azure must read back as Azure forever,
   not be retconned when a deployment moves. Azure sits ahead of the direct vendor in registry
   order, so a deployment with both configured prefers it. Its `vendorModelId` becomes the Azure
   DEPLOYMENT NAME in the URL path, which is why the deployment must be named after the model — and
   why rule 1 still holds.
1. **Vendor model ids are pinned exactly and never constructed.** No string interpolation, no
   "latest". A vendor renaming a model is a code change with a `checkedAt` bump, reviewed — not a
   config value that drifts and silently starts billing differently.
2. **Retired models are never deleted.** A `media_job` from six months ago must still resolve to a
   readable name and its recorded cost. `retiredAt` hides it from routing; nothing else changes.
3. **`indemnity: null` is not `false`.** fal.ai ships no IP indemnity; some direct vendors do; most
   say nothing. An agency asking *"who covers us if this infringes"* gets the real answer per model,
   including "the vendor does not say."
4. **`checkedAt` ages.** A descriptor not re-checked in 90 days surfaces in the same
   data-quality sweep that already runs (`quality.check`). Vendors ship monthly; a stale capability
   claim is how you promise a customer something that stopped being true.
5. **A synchronous adapter says so.** `MediaAdapter.synchronous` is what lets the concept card
   hand back a picture inline while everything else takes the queue. Undeclared means queued, which
   is the safe answer: an adapter that keeps job state in memory cannot be started in one process
   and polled from another.
6. **The catalogue is browser-safe.** `packages/media/src/client.ts` re-exports descriptors with no
   keys and no node dependencies, so the composer can render "why this model" without a round trip —
   the same split `packages/providers/src/client.ts` already makes.

---

## 5. Output types — the part that actually bites

Every vendor returns something different, and none of them return what the next stage needs. This is
the contract that makes them interchangeable.

### 5.1 What a model declares

```ts
export type ModelIO = {
  inputs: {
    text: boolean;
    referenceImages?: { max: number; role: "subject" | "style" | "ingredient" };
    referenceVideos?: { max: number };
    referenceAudio?: { max: number };
    firstFrame?: boolean;        // Veo bridging
    lastFrame?: boolean;
    sourceVideo?: boolean;       // Aleph: edit existing footage
    drivingPerformance?: boolean;// Act-Two
    negativePrompt?: boolean;
    seed?: boolean;              // reproducibility, where offered
  };
  outputs: {
    container: "mp4" | "png" | "jpeg" | "webp" | "mp3" | "wav";
    resolutions: string[];             // "1280x720", "1080x1920", "3840x2160"
    aspects: string[];                 // "16:9", "9:16", "1:1", "4:5"
    duration?: { min: number; max: number; step?: number; allowed?: number[] };
    audio: "none" | "embedded" | "separate";
    count: { min: number; max: number };
    delivery: "bytes" | "url";
    urlTtlSeconds?: number;            // Sora: ~3600. This is a deadline, not trivia
    extendable?: boolean;              // Veo scene extension
  };
};
```

Filled in, the spread is the whole problem:

| Model | Refs in | Duration | Audio out | Delivery |
|---|---|---|---|---|
| Veo 3.1 | 3 images (+ first/last frame) | 8s per call, extendable past 60s | **embedded** | operation poll |
| Sora 2 | 1 first frame + `characters` | **16 or 20 only** | embedded | URL, **~1h TTL** |
| Kling 3.0 | elements | up to 15s multi-shot | embedded (lip-sync) | job poll |
| Seedance 2.0 | **9 img + 3 vid + 3 audio** | up to 15s multi-shot | embedded, layered | job poll |
| Aleph 2.0 | source video + keyframe images | source length | passthrough | job poll |
| FLUX.2 pro | 9 images | — | — | bytes/URL |
| Nano Banana Pro | 14 images | — | — | bytes/URL |
| ElevenLabs TTS | — | text-length driven | **separate** (27 formats) | bytes, sync |

`seconds: 16 | 20` on one model and `8, extendable` on another is not a detail the composer can be
asked to know. The UI offers **durations the routed model actually supports**, read from `io`, and
says so when a request has to be rounded.

### 5.2 Normalization — one shape, and we probe rather than believe

Every adapter's `fetch()` returns raw bytes and a claimed shape. Nothing downstream trusts the
claim. `lib/media/normalize.ts` runs the same sequence for every output, whichever model produced it:

1. **Pull bytes into our storage immediately.** Not a URL, not later. Sora's download URL expires in
   about an hour; a paid-for render we failed to fetch is money burned for nothing.
2. **Sniff the container from the bytes**, not from a header we did not ask for. `images.ts` already
   does exactly this and says why.
3. **Probe with ffprobe** — real duration, dimensions, frame rate, codec, whether an audio stream is
   actually present, and loudness. Vendor-stated duration is a claim; the file is the fact. This is
   also what finally makes `Capabilities.limits.videoMaxSeconds` enforceable.
4. **Read provenance** — is there a C2PA manifest, is there a watermark. Record it before we touch
   the file, because our own render will strip it (§8).
5. **Checksum, then the normal door** — object storage → `asset` row → `asset.process` (renditions,
   scan). Generated bytes enter exactly the way an upload does. There is no second path.

```ts
export type NormalizedOutput = {
  assetId: string;
  kind: AssetKind;              // image | video | audio
  probed: { durationSeconds: number | null; width: number | null; height: number | null;
            hasAudio: boolean; codec: string | null; lufs: number | null };
  claimed: { durationSeconds: number | null; width: number | null; height: number | null };
  mismatch: string[];           // where the vendor's claim and the file disagree — kept, not hidden
  provenance: { c2pa: "present" | "absent"; watermark: string | null };
};
```

`mismatch` is deliberate. When a model says 8 seconds and delivers 7.4, that is worth knowing before
it fails a network's duration rule at publish time.

### 5.3 Audio: `embedded` vs `separate` is a routing input

Veo, Kling, Seedance and Sora emit audio inside the MP4. ElevenLabs emits a separate track. The
assembly stage needs to know which, because they demand different work: embedded audio must be
**extracted, level-matched and often replaced** when a scripted voice-over is going over the top;
separate audio must be **mixed, ducked and normalised** to −14 LUFS.

A job that wants a scripted voice-over should prefer a model whose audio can be discarded cheaply,
or accept that the generated dialogue is thrown away. Recording that as a routing input rather than
discovering it in the mix is the difference between a pipeline and a pile of scripts.

---

## 6. The rule that keeps quality honest: composite type, do not diffuse it

Ideogram V3 and Recraft V3 render text "near-perfectly." Everything else is approximate. For an ad,
the price, the offer and the CTA are legally sensitive copy under a client's brand with money behind
it. A model that gets `$49.99` right 95% of the time publishes a wrong price one time in twenty.

**So the offer, the price, the CTA, the logo and the legal line are composited deterministically**
from the brand kit — real fonts, real hex values, real strings, in an ffmpeg/`sharp` overlay pass.
The model generates imagery underneath it.

Three things fall out of that for free:

- **Safe zones are respected by construction.** Meta unified Stories and Reels in March 2026 on
  14% top / 35% bottom / 6% sides. If we own the overlay, we own the placement, and we can *check*
  it rather than hope.
- **Copy edits do not cost a generation.** Changing a headline re-runs a composite, not a $12 render.
- **A/B variants differ on one axis on purpose.** Same imagery, different hook — which is what makes
  a test mean anything.

Recraft and Ideogram stay in the registry for the case where type genuinely has to be *inside* the
image — a mocked-up package label, signage in a scene — and that case is flagged for human review.

---

## 7. Choosing, overriding, and explaining

Three layers, most specific wins:

1. **Registry routing** — the table in §3, filtered to models that are configured, permitted by the
   workspace, and whose `io` can satisfy the request.
2. **Workspace policy** — `workspace.settings.mediaRouting`. An agency that has standardised on one
   vendor for a client, or excluded one on legal grounds, sets it once. Same shape as the brand kit's
   per-section settings.
3. **Per-request pin** — the person picked a model in the composer. Always honoured; never silently
   overridden.

**Every `media_job` records `model_reason`** — a short sentence: *"Seedance 2.0: product motion from
a packshot; strongest reference conditioning (9 images)."* or *"Pinned by Brandon."* or *"Veo 3.1
unavailable — Vertex quota not granted; fell back to Kling 3.0."*

That is not decoration. M8.2 made "why is this control disabled" a product principle, and this is the
same promise applied to a choice we made on the customer's behalf and their money.

### Fallback, carefully

Falling back on a **spend** operation is how you double-bill.

- **Allowed** before any spend: the model is unconfigured, retired, over policy, or its `io` cannot
  satisfy the request. Fall to the next candidate and say so.
- **Never** after an ambiguous result. An ambiguous generation is **reconciled against the vendor's
  job list before any re-spend** — the identical rule `publish.execute` and `promotion.execute`
  already follow, for the identical reason.
- **Never silently downgraded.** If a cheaper model ran, the person is told which one and why, on
  the asset and in the job record. A quiet quality drop under a client's brand is worse than a
  visible failure.

### Reproducibility

Where a model offers a `seed`, we send one and store it. Together with the pinned `vendorModelId`
and the verbatim `spec` on `media_job`, that makes a generation **replayable** — which is what turns
"this shot was good, give me three more like it" into a real feature rather than a reroll.

---

## 8. Provenance across the model boundary

Veo and Sora sign their output — C2PA manifest plus a SynthID-class watermark. **Our own ffmpeg pass
strips the manifest.** Trimming, burning in captions, transcoding to 9:16: all of it destroys the
credentials the platform auto-labellers and EU AI Act Art. 50 (in force 2 Aug 2026) rely on.

So the model layer records what arrived (`provenance` on `NormalizedOutput`), and the render layer
re-signs and asserts the chain — generated by *model X*, type composited, resized to 9:16. Where we
cannot sign, the asset records `stripped`, and the composer says so plainly rather than shipping
media whose disclosure we quietly removed. Detail in `docs/media-generation.md` §8.

---

## 9. Consent-gated models

`performance` (Act-Two) and any avatar model are **off by default** and cannot run without a
complete, unexpired `voice`/`likeness` consent record: the named person, the authorising user, the
stored evidence, the scope, the expiry.

The vendors' own checks do not cover our case. ElevenLabs' voice-captcha verifies that the *uploader*
is the speaker; HeyGen and Synthesia require consent for custom avatars. In an agency, the person
building the asset is never the person whose likeness it is. That gap is ours to close, and it reuses
the M8.4 rights-and-authorisation-clock model already in the product.

---

## 10. Keeping the registry honest

- **Adapters, not models, are integrations.** `fal` is one adapter reaching a dozen models. Adding
  Kling behind an existing fal adapter is a registry row. Adding Runway is an adapter.
- **`mock` is a first-class adapter**, not a test double — deterministic fixtures for every job
  kind, zero network, zero spend, exercising the full submit → poll → fetch → normalize → asset loop.
  `PROVIDERS_ENABLE_MOCK=1` already proves this pattern works for networks.
- **A capability surface, like `/capabilities`.** M8.2 generates a public page from
  `packages/providers`. The model registry gets the same treatment: what we can generate, with which
  model, at what fidelity, under what terms — including the honest gaps.
- **`checkedAt` drift is a data-quality finding**, not a TODO comment, and lands in the sweep that
  already runs nightly.

---

## 11. Open decisions

1. **Primary router** — fal.ai (breadth, per-output billing, ~1,000 endpoints, **no IP indemnity**)
   vs Runway Dev (first-party Aleph/Act-Two, narrower) vs direct-only. Recommendation: **fal as the
   default adapter, plus a direct Vertex adapter for Veo** — the `rocketease` GCP project, IAM and
   audit logging already exist for YouTube/GA4, and enterprise data terms matter for agency clients.
   Verify Vertex enablement and quota on that project first; the Business Profile APIs shipped at
   quota 0, so "enabled" is not "usable."
   **Landed 2026-09-01**: `packages/media/src/fal` — Kling 2.5 Turbo Pro (I2V + T2V, $0.07/s
   verified on the model pages) and FLUX.2 [pro] images, forced by Azure's verified sora-2
   retirement (2026-10-15; `azure-sora-2` carries `retiredAt`). fal's queue contract returns
   per-request status/response URLs; they persist in `media_job.remote_meta` because the docs say
   use-never-construct. Vertex/Veo remains open.
2. **Higgsfield** — competitor, vendor, or neither. It has an official REST API and SDKs, and
   Marketing Studio (URL → formatted ad, on Seedance 2.0) is the closest thing to what we would
   build. Cheapest path to a working ad pipeline; also the thing we would be reselling.
3. **Indemnity floor** — do we refuse to route agency/client work to a model whose vendor offers no
   indemnity, or surface it and let the workspace decide? Leaning surface-and-decide, defaulted to
   conservative.
4. **Seed and replay** — store seeds always, or only when the person asks for variants.
5. **Consent-gated models in v1** at all, or stock voices and no performance transfer until the
   consent flow is proven.

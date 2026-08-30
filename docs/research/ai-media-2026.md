# Generative media for social ads, 2025–2026

Companion to `trends-2026.md`, which covered platforms, measurement and text AI. This one covers
**image and video ad creative, voice, captions and music** — what the models can actually do, what
the ad-creative tools ship, and which gaps are worth closing.

Same rule as before: platform docs, vendor API docs and legal texts are authoritative; "2026
comparison" blog posts are directional and flagged. Nothing here reaches product copy unverified.
Every price below is directional — verify against the vendor's own page before it reaches a plan.

---

## 1. The finding that reorganises everything

Three independent sources say the same thing, unprompted:

> *"The smartest approach isn't picking one model — it's having access to all of them and knowing
> when to use each."*

And the market has already priced that in. **Every serious platform in 2026 is a router, not a
model.** Higgsfield lets you switch between 8+ video models inside one project — Sora 2 for hero
shots, Kling for product close-ups, Veo 3.1 for social cutdowns. Runway launched **Runway Dev**
(8 Jul 2026) as *"one API to integrate the best image, video, audio and real-time character
models."* fal.ai runs ~1,000 production endpoints behind a single HTTP surface.

**Picking "our video model" is the wrong decision to make.** The decision is which router, and what
routing policy.

## 2. The second finding: reference conditioning is the universal primitive

Every capable model in 2026 accepts reference images, and each vendor brands it differently. They
are all the same feature:

| Vendor | Name | Capacity |
|---|---|---|
| Veo 3.1 | "Ingredients to Video" | up to **3** reference images; also first/last-frame bridging and scene extension |
| Seedance 2.0 | reference inputs | up to **9 images + 3 videos + 3 audio** in one generation |
| Kling 3.0 | elements / character consistency | 15s multi-shot holding one identity across cuts |
| Runway | references + Act-Two | character reference image + driving performance video |
| Nano Banana Pro | reference images | up to **14**, character consistency for up to 5 people |
| FLUX.2 [pro] | multi-reference editing | up to **9** source images |
| Higgsfield | "Soul ID" | locks a person/persona across generations |
| OpenArt | consistent characters | create once, reuse across scenes, outfits, angles |

The abstraction this implies is a **reference set** — product shots, logo, palette, talent — bound
to a generation request and passed to whichever model runs it.

**That matters enormously for RocketEase specifically.** Milestone 10 already built the hardest
input: a brand kit with 8 logo variants, palette, typography, imagery direction, dated offers, and
library assets flagged as brand assets. The scarce thing in 2026 is not model access — it is
structured, current, per-client brand truth. We have it and the point tools do not.

## 3. Video models — what each is actually for

Directional pricing; capability claims from vendor docs and comparison testing.

| Model | ~$/sec | Native audio | Max clip | Distinctive capability |
|---|---|---|---|---|
| **Veo 3.1** | ~$0.40 (Fast ~$0.15, Lite ~$0.03) | **yes** | 8s, extendable past a minute | Ingredients-to-video (3 refs); **scene extension** (each new clip continues from the last second); first/last-frame bridging with audio; 720p/1080p/4K |
| **Kling 3.0** | ~$0.10 | yes (lip sync, multilingual) | **15s multi-shot** | The only production-viable multi-shot option holding character identity, lighting and spatial logic across cuts |
| **Seedance 2.0** | ~$0.09–0.14 | yes (accurate lip sync, 8+ languages, layered dialogue+music+SFX in one render) | 15s multi-shot | **9 images + 3 videos + 3 audio as references** in one generation — subject swap, style transfer, motion transfer, lip-sync |
| **Sora 2 / pro** | ~$0.10 (pro higher) | yes | 16s or 20s | Cleanest published job contract; `characters` for cross-shot consistency; `/extensions` and `/edits` |
| **Runway Gen-4.5** | — | no | — | Prompt adherence, controllable composition, native 4K |
| **Runway Aleph 2.0** | — | — | — | **Video-to-video editing**: localized edits to existing footage, keeping everything else stable, consistent across cuts. API since 2 Jun 2026 |
| **Runway Act-Two** | — | — | — | **Performance transfer**: driving performance video + character reference → the character mimics expressions, head and body motion. API since 21 Jul 2025 |

Two of those deserve emphasis because they are not "another text-to-video":

- **Aleph 2.0 edits footage you already have.** For an agency with a client's real product footage,
  that is worth more than any text-to-video model.
- **Act-Two turns one reference image into a performance.** Same category as an avatar vendor, with
  the same consent obligations (§8).

**Sora 2's API is still the shape to design against** — it is the clearest published contract:
`POST /v1/videos` → job (`queued`→`in_progress`→`completed`/`failed`) → poll `GET /v1/videos/{id}`
or take the `video.completed`/`video.failed` webhook → download `GET /v1/videos/{id}/content`
(`variant=video|thumbnail|spritesheet`). **Download URLs expire in ~1 hour.** Veo instead polls a
long-running operation with exponential backoff (1s → 10s cap) and bills only on success.

## 4. Image models — and why the best one is usually "don't"

Per-image prices from fal's catalogue (Aug 2026).

| Model | ~$/image | Multi-reference | Text rendering | Best at |
|---|---|---|---|---|
| **FLUX.2 [pro]** | $0.03/MP | **9 source images** | strong | **Brand work.** Predictable across batches, strong adherence on multi-element prompts, hex colour precision |
| **Nano Banana Pro** (Gemini 3 Pro Image) | $0.15 ($0.30 4K) | **14 refs**, 5-person consistency | industry-leading, multilingual | Physics-accurate materials and lighting; product photography |
| **Seedream V4.5** | $0.04 | multi-image | competent | Photorealism; unified generate+edit in one model; 4K |
| **Recraft V3** | $0.04 raster / $0.08 vector | style presets | **best-in-class** | Typography-heavy design, vector, brand colour palette as a parameter |
| **Ideogram V3** | $0.03–0.09 | limited | **near-perfect spelling** | The one model that reliably renders complex text |
| **GPT Image 1.5** | $0.009–0.20 | image-to-image | good | Cost tiers; natural-language editing |
| **Qwen Image Max** | $0.075 | LoRA | strong (LLM-based) | Precise instruction editing |

**But the text finding cuts the other way.** Ideogram and Recraft are "near-perfect" and everyone
else is approximate. For an ad, the offer, the price and the CTA are legally sensitive copy. A model
that renders `$49.99` correctly 95% of the time is a model that publishes a wrong price one time in
twenty, under a client's brand, with money behind it.

**So the right answer for ad text is not a better model — it is not using a model.** Generate the
imagery; composite the type deterministically from the brand kit. That also solves safe zones (§6)
in the same pass.

## 5. Product fidelity — the actual quality bar

The named failure mode for product ads, and it is specific:

> *"Many standard AI video models suffer from warping where the shape, texture, or branding of a
> product changes mid-motion. The core product must remain recognizable and consistent for effective
> and compliant advertising."*

What is reported to work: **a fixed product reference plus constrained prompting** — which
"can produce ecommerce-ready lifestyle and studio images while preserving the exact logo, label
text, packaging geometry, colour palette and brand style." A whole tool tier exists purely for this
(Claid, Presti, on-model packshot generators), tuned for fidelity rather than imagination.

The pipeline consequence: **the default path for a product ad is a real packshot →
reference-conditioned edit → image-to-video.** Text-to-video is for background and b-roll, where
nobody is checking whether the logo is right.

## 6. Placement specs are numeric, sourced, and checkable

Meta unified Stories and Reels onto **one safe zone in March 2026**, and is steering advertisers off
square toward taller ratios:

- **Safe zone: 14% top, 35% bottom, 6% each side.** On a 1440×2560 export that is ~358px top
  (profile icon, username, "Sponsored"), ~896px bottom (CTA, engagement icons, captions), ~87px
  sides.
- Ratios: **4:5** (1080×1350) feed, **9:16** (1080×1920) Stories/Reels, 1:1 carousel. 9:16 is the
  dominant 2026 format across Reels, TikTok, Shorts, Snap and Stories.
- TikTok: 9:16, ≥720p, **with sound**; text overlays at 5–10 words per second.

And the timing rule is measurable: the first 3 seconds determine ~71% of whether a viewer keeps
watching; TikTok's own guidance is to state the proposition in the first 3 seconds. Socialinsider
benchmarks: 85%+ retention through 3s → 2.8× total views; 70–85% → 2.2×.

This is exactly the shape of `packages/providers/src/cost.ts` and `lib/ai/generator/ad-specs.ts` —
sourced numbers, `verified: false` when a vendor's own page could not be read, warn rather than
error on anything unverified. **A preflight that says "your CTA sits inside the bottom 35% and will
be covered by the Reels UI" is deterministic, checkable, and nobody ships it.**

## 7. The routing layer — aggregator vs direct

| Option | Catalogue | Billing | Notes |
|---|---|---|---|
| **fal.ai** | ~1,000 curated production endpoints — FLUX, Seedream, Nano Banana, Kling, Wan, Veo | per output ($0.03/image Seedream, $0.05/s Wan 2.5, $0.40/s Veo 3) or GPU-second | Optimised runtime, near-zero cold starts. **No IP indemnity** |
| **Replicate** | overlapping open-weight catalogue | per output / compute | Swapping between the two is an endpoint and model id, not a pipeline rewrite |
| **Runway Dev** | first-party Gen-4.5, Aleph 2.0, Act-Two + others | — | Launched 8 Jul 2026 as a one-API media platform |
| **Higgsfield** | 8+ video models, camera presets, Soul ID | — | Official REST API + Node/Python SDKs (`docs.higgsfield.ai`, `higgsfield-ai/higgsfield-js`); async submit → poll or webhook |
| **Direct (Vertex / OpenAI)** | one vendor | vendor | IAM, audit logging, VPC-SC, enterprise data terms — the reason to go direct despite the extra work |

"No IP indemnity" is not a footnote for an agency product. A client asking *"who indemnifies us if
this creative infringes"* deserves a real answer, and per-vendor it differs.

## 8. Voice, likeness and consent

- **Tennessee ELVIS Act** (21 Mar 2024) was the first to name *voice* as a protected property right;
  an unauthorised digital replica is actionable even absent deception. Montana, Arkansas, Washington
  and others have followed.
- **NO FAKES Act** — reintroduced 20 May 2026 (S.4591 / H.R.8915). **Still a bill.** Plan around it;
  do not rely on it.
- The 2026 working standard is **documented, explicit consent** — not implied, not a ToS clause.
- HeyGen requires consent verification for custom avatars; Synthesia requires explicit human consent
  and restricts custom avatars to Enterprise. The avatar vendors are ahead of the social tools here.

ElevenLabs' voice-captcha verifies that the uploader is the speaker. **It does not cover the agency
case**, which is our core case: an agency employee cloning their client's founder's voice. The
captcha passes; the consent does not exist. Same problem for Act-Two and any avatar built from a
client's talent. The consent record has to be ours.

## 9. Audio — ElevenLabs as the reference shape

Not a video tool at all: a narrow primitive sold as an API, priced per unit of output, with the
compliance work done for you. The *shape* is the lesson.

| Capability | Endpoint shape | Unit | Listed rate (Aug 2026) |
|---|---|---|---|
| Text to Speech | `POST /v1/text-to-speech/{voice_id}`, sync, ~27 output formats | characters | $0.10/1k (v2/v3), $0.05 (Flash/Turbo) |
| Text to Dialogue | multi-speaker, WebSocket streaming variant | characters | as TTS |
| Speech to Text (Scribe) | batch **with webhook**, plus realtime | audio minutes | $0.22/hr batch, $0.39/hr realtime |
| Music | generation + "composition plans" (structured JSON control) | per generation | ~$0.15/min |
| Sound Effects | text → SFX | per generation | ~$0.12/min |
| Dubbing | per-project, async, refine/regenerate | source minutes | $0.33/min watermarked, $0.50 clean |
| Voice Changer | audio → audio, preserves delivery | chars/minutes | — |
| Voice Cloning | Instant + Professional, both gated by voice-captcha | — | plan-gated |
| Forced Alignment | audio + text → time-aligned transcript | audio minutes | — |

Three structural lessons: **billing is per unit of output in dollars**, not an abstract credit;
**everything long-running is async with a webhook**; **consent is a product feature**.

## 10. Captions and transcription

| Vendor | English WER | Latency | Price | Notes |
|---|---|---|---|---|
| ElevenLabs Scribe v2 | ~3–4% | ~150ms first partial, 90+ langs | $0.22/hr | leads independent English benchmarks; diarization built in |
| AssemblyAI Universal-3.5 Pro | ~3.40% | ~760ms to final | ~$0.21/hr | best diarization (cpWER ~30.2); contextual prompting |
| Deepgram Nova-3 | ~5.3% | lowest end-of-speech | cheapest accurate English | built for voice agents |
| Whisper (self-host) | — | — | infra only | MIT, 99+ languages, no vendor |

For social captions the deciding features are **word-level timestamps** and **speaker labels**, not
the last half-point of WER. All four provide them.

The publishing side is what tools get wrong: **almost no network accepts a caption sidecar over its
API.** YouTube does. Instagram, TikTok, LinkedIn do not — captions must be **burned into pixels**.
Social video autoplays muted, so burned-in is the right default anyway; the sidecar (SRT/VTT) is
kept for YouTube, accessibility and the archive.

## 11. Music — the trap, and it is a big one

Two problems, routinely conflated.

**A — AI music provenance.** Universal settled with Udio (Oct 2025); Warner settled with Suno
(Nov 2025); **Sony has settled with neither**, with a pivotal ruling expected summer 2026. Udio
pivoted to a walled garden — output cannot leave the platform. Suno's paid tiers grant a
commercial-use licence to the specific output, not copyright ownership. **ElevenLabs Music is
trained on licensed data**, which is why it is the only one of the three a business can put in a
client's ad without an open question hanging over it.

**B — platform music libraries do not travel, and business accounts cannot use the big ones at all.**
This is the finding with the most product consequence:

- A **TikTok Business Account** sees only the **Commercial Music Library**; the general Sounds
  library disappears on conversion. CML is cleared for TikTok organic-from-business and TikTok ads.
- An **Instagram/Facebook business account** cannot use the general Instagram music library even
  organically. It gets the **Meta Sound Collection**, cleared **for Facebook and Instagram only**.
- Neither licence travels. The same Reel cross-posted to TikTok, YouTube or LinkedIn is running
  unlicensed music on three of them.

So "make one video, publish it to five networks" — the premise of a social publishing tool — is **a
licensing violation on four of the five whenever platform-library music is used.** Nobody in the
category models this. It is the same shape as the M8.4 rights clocks, which already exist.

## 12. Provenance, labelling and the law

Four different things, constantly conflated — a file can carry all four independently:

1. **C2PA Content Credentials** — signed manifest in the file. Spec v2.3 (Feb 2026). OpenAI signs
   every Sora 2 video; Google signs Veo/Imagen/Lyria output.
2. **Invisible watermarks** — SynthID and equivalents; survive re-encode.
3. **Platform labels** — TikTok (mandatory on realistic AI visuals/audio, reads C2PA to auto-label;
   joined the C2PA Steering Committee Jul 2026; 1.3bn+ videos labelled), YouTube ("AI use"
   attribute), Meta (auto-label from C2PA, strict for political/social-issue ads).
4. **Legal disclosure duty** — **EU AI Act Art. 50, machine-readable marking of synthetic content,
   from 2 Aug 2026.**

**The trap for us: re-encoding strips C2PA.** Any ffmpeg pass — trimming a Veo clip, burning in
captions, transcoding to 9:16 — destroys the manifest the platform auto-labellers and Art. 50 lean
on. A pipeline that renders AI video and does not re-sign is *removing* the disclosure the model
vendor attached. That is worse than not generating at all, and it is the default behaviour of every
naive ffmpeg pipeline.

## 13. What the ad-creative tools actually ship

The category has split into five jobs:

| Job | Tools |
|---|---|
| AI UGC video (synthetic creators) | Arcads, Creatify, Captions |
| AI avatar video | HeyGen, Synthesia |
| Static / performance creative | AdCreative.ai (volume + performance scoring), Pencil, Creatopy, Canva |
| End-to-end admaker | Icon, Pippit, Higgsfield Marketing Studio (URL → formatted ad, on Seedance 2.0) |
| Enterprise automation | Smartly |

Entry pricing runs free (Meta Advantage+ Creative, Canva free tier) to ~$14–40/mo self-serve.

Two things to take seriously:

- **Meta Advantage+ Creative is free and built into Ads Manager.** Competing with it *on Meta, on
  generation alone* is a losing game. Our angle has to be cross-network, brand-consistent and
  honest — not "a better generator for Facebook."
- **Higgsfield Marketing Studio takes a product URL and returns formatted ad content in multiple
  output configurations.** That is the closest thing to what we would build, and it is the
  benchmark to beat on brand fidelity and honesty rather than on raw generation.

Meanwhile the social-management incumbents — Hootsuite, Sprout, Buffer, Later — ship AI as **text
and analytics**: caption writing, hashtag generation, video *script* writing, sentiment, best-time.
Dedicated AI video generation is characterised as emerging, not standard. The video work is being
done in point tools and pasted back in.

**Nobody owns the whole chain**: brand truth → brief → plan → shots → voice → music → captions →
per-network renders → placement preflight → disclosure → publish → measure. Everyone owns a link.

## 14. Adjacent tools worth knowing, and what they are not

- **Canva Connect API** — brand templates + async autofill jobs. Real and useful, but **text and
  image fields only**; colours, fonts and other design properties cannot be changed, and it requires
  the user to be in a **Canva Enterprise** org. That makes it an *interop/export* target for teams
  already on Canva, not a generation engine.
- **DaVinci Resolve** — a desktop NLE with a Neural Engine (Magic Mask, IntelliTrack, smart reframe,
  Speed Warp, Super Scale, voice isolation, voice-to-subtitle). **No API; not an integration
  target.** It is useful as a *feature checklist* for what a render pipeline should eventually do —
  smart reframe and voice isolation especially — and as a reminder that most of these are solved
  problems available as libraries, not model calls.
- **OpenArt** — consistent characters, create-once-reuse. Same primitive as Soul ID; a consumer
  surface rather than an infrastructure one.

## 15. Where that leaves RocketEase

1. **Route, don't pick.** Model choice is per-job, not a global env var. One adapter interface, an
   aggregator behind it, direct vendors where terms matter.
2. **The brand kit is the moat.** Reference-conditioned generation needs structured brand truth.
   M10 already built it. Bind it to every generation.
3. **Product fidelity by construction** — real packshot → reference edit → image-to-video, not
   text-to-video.
4. **Composite type, don't diffuse it.** Offers, prices and CTAs are deterministic overlays from the
   brand kit. This is also how safe zones get respected.
5. **Placement preflight as a sourced spec.** 14/35/6, 4:5 and 9:16, ≥720p, hook by 3s — checkable,
   and nobody ships it.
6. **Per-network music clearance as a first-class object**, in the M8.4 rights-clock shape.
7. **Re-signed provenance**, so our own pipeline does not strip the disclosure Art. 50 requires.
8. **Voice and likeness consent records with expiry**, in the agency shape the vendors do not cover.
9. **Close the loop.** Generated creative already flows into publish → insights → conversions. A
   `media_job` lineage on the asset means we can eventually answer *"do generated ads actually
   perform?"* — which is the M7 recommendations idiom, and the thing no point tool can do.

## 16. A real media pipeline is the prerequisite

None of the above is reachable today. `asset.process` handles images only; a video upload gets a
checksum and nothing else — no duration, no dimensions, no poster frame. `Capabilities.limits.
videoMaxSeconds` is validated against a duration we never learn. **That is a live defect in video
publishing right now**, before a single frame is generated.

---

## Sources

Routing & platforms — https://docs.higgsfield.ai/docs · https://github.com/higgsfield-ai/higgsfield-js · https://geo.higgsfield.ai/higgsfield-ai-features-full-guide-2026 · https://higgsfield.ai/camera-controls · https://docs.dev.runwayml.com/api-details/api_changelog/ · https://fal.ai/learn/tools/ai-image-generators · https://www.teamday.ai/blog/fal-ai-vs-replicate-comparison · https://www.teamday.ai/blog/ai-image-video-api-providers-comparison-2026 · https://vantaige.io/ai-tool/fal-ai

Video models — https://developers.openai.com/api/docs/guides/video-generation · https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/ · https://ai.google.dev/gemini-api/docs/veo · https://ai.google.dev/gemini-api/docs/pricing · https://fal.ai/learn/tools/seedance-2-0-vs-kling-3-0 · https://www.3daistudio.com/blog/best-ai-video-generator-2026 · https://picsart.com/compare-models/seedance-2-vs-kling-3-0/ · https://unifically.com/blogs/seedance-2.0-vs-kling-3.0 · https://www.pixazo.ai/models/runway · https://aitooltier.com/tools/runway · https://modelslab.com/blog/api/veo-3-1-vs-kling-3-sora-2-ai-video-api-cost-2026

Image models — https://fal.ai/learn/tools/ai-image-generators · https://www.atlascloud.ai/blog/guides/best-ai-image-generation-models-2026 · https://www.pixmind.io/posts/seedream-5-0-pro-vs-nano-banana-pro-vs-flux-2-pro-2026-image-generation-tripartite-showdown · https://morphed.app/blog/best-ai-image-generation-models

Product fidelity — https://uselamina.ai/blog/benchmark-can-ai-product-photography-generate-ecommerce-ready-images-without-changing-logos-labe · https://claid.ai/blog/article/ai-product-photo-tools · https://on-model.com/blog/best-ai-packshot-generators · https://dreamina.capcut.com/ai-video/turn-product-photos-into-ai-videos

Placement specs & hooks — https://behaviour.digital/post/meta-reels-safe-zone-14-top-35-bottom-6-sides-the-2026-official-guide · https://billo.app/blog/meta-ads-safe-zones/ · https://www.tryvizup.com/blog/meta-ad-specs-2026-every-dimension-size-you-need · https://admanage.ai/blog/tiktok-ad-specs · https://www.adroast.ai/blog/tiktok-ad-hooks-first-3-seconds · https://www.stackmatix.com/blog/tiktok-ad-creative-best-practices-2026

Ad-creative tools — https://adrio.ai/blog/best-ai-ad-creative-tools · https://www.hyperfx.ai/blog/arcads-vs-creatify-vs-higgs-field-vs-hyper-2026 · https://resources.rework.com/tools/ai-tools/best-ai-ad-creative-tools-2026 · https://www.digitalapplied.com/blog/ai-social-media-management-tools-2026-comparison · https://genesysgrowth.com/blog/hootsuite-owlywriter-vs-buffer-ai-vs-sprout-social-ai

Audio & captions — https://elevenlabs.io/docs/api-reference/text-to-speech/convert · https://elevenlabs.io/docs/llms.txt · https://elevenlabs.io/pricing/api · https://elevenlabs.io/docs/eleven-api/concepts/voice-cloning · https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide/ · https://www.assemblyai.com/blog/whisper-alternatives

Music licensing — https://blog.dubspot.com/ai-music-licensing-explained-2026 · https://www.licenseorg.com/blog/ai-music-licensing-suno-elevenlabs · https://www.soundstripe.com/blogs/tiktok-music-library-explained · https://brands.joinstatus.com/tiktok-commerical-music-library · https://www.foximusic.com/blog/instagram-reels-music-copyright-legal-guide/ · https://www.velveteen.fm/guides/instagram-for-musicians/music-on-instagram-licensing

Provenance & law — https://c2pa.org/c2pa-welcomes-tiktok-to-steering-committee/ · https://c2pa.ai/tiktok · https://c2pa.ai/youtube · https://billo.app/blog/ai-labeling/ · https://influencermarketinghub.com/ai-disclosure-rules/ · https://atlan.com/know/data-governance/elvis-ai-act/ · https://blog.promise.legal/ai-voice-clones-no-fakes-act-creators/ · https://vorplabs.com/ai-regulatory-updates/deepfake-laws

Adjacent — https://www.canva.dev/docs/connect/autofill-guide/ · https://www.canva.dev/docs/connect/api-reference/brand-templates/ · https://www.blackmagicdesign.com/products/davinciresolve · https://thepostflow.com/ai/ai-in-davinci-resolve/ · https://openart.ai/features/ai-character/

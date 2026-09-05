/*
 * fal.ai models — the breadth adapter's first three rows.
 *
 * Read off fal's own model pages on 2026-09-01, not from memory. The reason
 * these exist NOW is a deadline, not breadth: Azure retires sora-2 on
 * 2026-10-15 (learn.microsoft.com model-retirement-schedule, read 2026-09-01),
 * so Kling 2.5 Turbo Pro takes over as the default video route — cheaper
 * ($0.07/s vs the $0.10/s we configured for Sora) and ahead of it in
 * catalog.ts order. FLUX.2 [pro] sits AFTER the Azure image models on
 * purpose: Azure stays the image default (decision 2026-09-01,
 * docs/plans/m12.6-layered-acceptance-editor.md §3); fal images are for
 * per-job fit and quota freedom, not price.
 */
import type { ModelDescriptor } from "../io";

const I2V_PAGE = "https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
const T2V_PAGE = "https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/text-to-video";
const FLUX_PAGE = "https://fal.ai/models/fal-ai/flux-2-pro";

const CHECKED_AT = "2026-09-01";

/*
 * Kling's terms, shared by both variants. fal's model pages say "commercial
 * use" for partner models and nothing about indemnity or training — and null
 * is "the vendor does not say", which is not the same as false.
 */
const KLING_TERMS = { commercialUse: true, indemnity: null, trainingOptOut: null };

/*
 * "$0.35 for a 5s video, $0.07 for every additional second" (both Kling
 * pages, 2026-09-01) — 0.35/5 = 0.07, so the rate is flat per second and the
 * arithmetic is exact rather than an estimate.
 */
const KLING_COST = { unit: "video_seconds" as const, amountUsd: 0.07, verified: true };

/*
 * Index-aligned with `aspects` because the reference fitter reads them in
 * pairs. Kling's fal pages state no output resolution; 1080p is Kling's own
 * documented output class, and what matters operationally is that a reference
 * fitted to these sizes yields an output in the requested aspect — for
 * image-to-video the INPUT IMAGE decides the frame, there is no aspect knob.
 */
const KLING_RESOLUTIONS = ["1080x1920", "1920x1080", "1080x1080"];
const KLING_ASPECTS = ["9:16", "16:9", "1:1"];

const KLING_OUTPUTS = {
  container: "mp4" as const,
  resolutions: KLING_RESOLUTIONS,
  aspects: KLING_ASPECTS,
  // `allowed`, not min/max: the API takes the literal strings "5" and "10".
  duration: { min: 5, max: 10, allowed: [5, 10] },
  // Kling 2.5 emits silent video (audio arrived in 3.0). The assembly graph
  // must add the sound; there is no embedded track to strip or duck against.
  audio: "none" as const,
  count: { min: 1, max: 1 },
  delivery: "url" as const,
  // fal retains request results long enough that the 15s sweep never races
  // it; a day is the same abandon-the-spinner deadline Sora carries.
  urlTtlSeconds: 86_400,
};

/*
 * ORDER MATTERS WITHIN THE ADAPTER TOO. Text-to-video sits first: routing
 * cannot express "this model REQUIRES a reference", so a referenceless
 * hero_shot must land on the row that needs none — and a spec that DOES carry
 * a reference skips t2v anyway (it takes no reference images), falling
 * through to i2v. product_motion lists only i2v, where the reference is the
 * whole point.
 */
export const FAL_MODELS: ModelDescriptor[] = [
  {
    key: "fal-kling-25-pro-t2v",
    adapter: "fal",
    vendorModelId: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
    label: "Kling 2.5 Turbo Pro (text to video)",
    kind: "video",
    // No reference input at all, so routing skips it whenever a spec carries
    // one — which is exactly how a hero shot WITH a packshot lands on the
    // image-to-video row instead.
    jobs: ["hero_shot", "broll"],
    io: {
      inputs: { text: true, negativePrompt: true },
      // Text-to-video is the one variant with an aspect knob: the API takes
      // aspect_ratio "16:9" | "9:16" | "1:1" (page, 2026-09-01).
      outputs: KLING_OUTPUTS,
    },
    cost: { ...KLING_COST, sourceUrl: T2V_PAGE },
    provenance: { c2pa: false, watermark: null },
    terms: { ...KLING_TERMS, sourceUrl: T2V_PAGE },
    checkedAt: CHECKED_AT,
  },
  {
    key: "fal-kling-25-pro-i2v",
    adapter: "fal",
    vendorModelId: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    label: "Kling 2.5 Turbo Pro (image to video)",
    kind: "video",
    // The fidelity path: a real packshot becomes the opening frame, so the
    // real product is genuinely on screen. `product_motion` routes here first.
    jobs: ["product_motion", "hero_shot", "broll"],
    io: {
      // ONE image, and it is a "source" the way Sora's is: a literal frame
      // the model animates from, not a subject it reinterprets. `start`
      // refuses without it — the vendor would 422 anyway, after billing risk.
      inputs: { text: true, referenceImages: { max: 1, role: "source" }, negativePrompt: true },
      outputs: KLING_OUTPUTS,
    },
    cost: { ...KLING_COST, sourceUrl: I2V_PAGE },
    // The page claims no credential and no watermark; 12.5a probes the bytes
    // on arrival rather than believing either direction.
    provenance: { c2pa: false, watermark: null },
    terms: { ...KLING_TERMS, sourceUrl: I2V_PAGE },
    checkedAt: CHECKED_AT,
  },
  {
    key: "fal-flux-2-pro",
    adapter: "fal",
    vendorModelId: "fal-ai/flux-2-pro",
    label: "FLUX.2 [pro] (fal)",
    kind: "image",
    // Scene stills only for now: this endpoint is text-to-image (no reference
    // fields on its page), so claiming `product_still` — whose whole point is
    // reference conditioning — would be dishonest. The multi-reference FLUX
    // edit endpoints are separate rows for another day.
    jobs: ["scene_still"],
    io: {
      inputs: { text: true, seed: true },
      outputs: {
        // We ask for PNG explicitly (output_format), so composites stay lossless.
        container: "png",
        // The API takes named size presets, not pixel pairs; the adapter maps
        // aspect -> preset. No reference inputs, so no fitter targets needed.
        resolutions: [],
        aspects: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        audio: "none",
        count: { min: 1, max: 1 },
        delivery: "url",
        urlTtlSeconds: 86_400,
      },
    },
    /*
     * "$0.03 for the first megapixel of output, plus $0.015 per extra
     * megapixel" (page, 2026-09-01). Our presets sit at ~1MP, so the flat
     * per-image figure is exact at the sizes we request; a larger preset
     * would bill more than this estimate says, which is why none is offered.
     */
    cost: { unit: "images", amountUsd: 0.03, verified: true, sourceUrl: FLUX_PAGE },
    provenance: { c2pa: false, watermark: null },
    terms: { commercialUse: true, indemnity: null, trainingOptOut: null, sourceUrl: FLUX_PAGE },
    checkedAt: CHECKED_AT,
  },
];

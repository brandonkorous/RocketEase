/*
 * OpenAI image models — direct, and the different model we run on Azure.
 *
 * These are NOT one descriptor with two adapters: same weights, different
 * processor, different terms, and separate keys so a media_job that ran on
 * Azure reads back as Azure forever. gpt-image-1 is kept and RETIRED rather
 * than deleted, because the choice was forced by a deprecation date:
 *
 *   gpt-image-1      inference-deprecates 2026-10-23   <- seven weeks out
 *   gpt-image-1.5    2026-12-16
 *   gpt-image-1-mini 2027-04-07
 *   gpt-image-2      2027-10-21
 *
 * Read from this subscription's own catalogue on 2026-08-30:
 *   az cognitiveservices model list -l eastus2
 *
 * Capabilities below are from Microsoft Learn's image-generation page and
 * OpenAI's gpt-image-2 model page, both read on 2026-08-30. What nobody has
 * read off a page is still null: the per-image rate, indemnity, and whether
 * outputs carry a C2PA manifest (12.5a probes the bytes for that rather than
 * believing this field).
 */
import type { ModelDescriptor } from "../io";

const DOCS = "https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/dall-e";
const PRICING = "https://openai.com/api/pricing/";
const TERMS = "https://openai.com/policies/services-agreement/";
const AZURE_TERMS = "https://azure.microsoft.com/en-us/support/legal/";
const DATA_PRIVACY = "https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy";
/** Azure's own retail price API — machine-readable, and what the bill is computed from. */
const AZURE_PRICING = "https://prices.azure.com/api/retail/prices?$filter=productName eq 'Azure OpenAI Media'";

const CHECKED_AT = "2026-08-30";

/**
 * gpt-image-1's three documented sizes. It accepts NOTHING else, which is why
 * this is a closed map rather than arithmetic.
 */
const GPT_IMAGE_1_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};

/**
 * gpt-image-2 takes arbitrary resolutions, within real constraints: both edges
 * divisible by 16, aspect between 1:3 and 3:1, and 655,360–8,294,400 pixels.
 *
 * So these are chosen to sit just ABOVE each placement's native canvas
 * (1080×1080, 1080×1350, 1080×1920 in lib/media/canvas/specs.ts) — 1080 is not
 * divisible by 16, and generating at 1024 square then cropping up is the
 * `low_resolution` preflight warning by construction. Downscaling from 1088 is
 * free; enlarging from 1024 always shows.
 */
const GPT_IMAGE_2_SIZES: Record<string, string> = {
  "1:1": "1088x1088",
  "4:5": "1088x1360",
  "9:16": "1088x1936",
  "16:9": "1936x1088",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};

const SIZES_BY_MODEL: Record<string, Record<string, string>> = {
  "gpt-image-1": GPT_IMAGE_1_SIZES,
  "gpt-image-2": GPT_IMAGE_2_SIZES,
  "azure-gpt-image-2": GPT_IMAGE_2_SIZES,
};

/** The size this model wants for an aspect, or null when it does not serve it. */
export function sizeFor(model: ModelDescriptor, aspect: string | undefined): string | null {
  const map = SIZES_BY_MODEL[model.key];
  if (!map) return null;
  return map[aspect ?? "1:1"] ?? null;
}

// ORDER IS THE DEFAULT ROUTE (see catalog.ts). The live model comes first; the
// retired one is kept only so an old media_job still resolves to a name.
export const OPENAI_MODELS: ModelDescriptor[] = [
  {
    key: "gpt-image-2",
    adapter: "openai",
    vendorModelId: "gpt-image-2",
    label: "GPT Image 2",
    kind: "image",
    jobs: ["scene_still"],
    io: {
      inputs: { text: true },
      outputs: {
        container: "png",
        resolutions: Object.values(GPT_IMAGE_2_SIZES),
        aspects: Object.keys(GPT_IMAGE_2_SIZES),
        audio: "none",
        count: { min: 1, max: 10 },
        delivery: "bytes",
      },
    },
    cost: { unit: "images", amountUsd: null, verified: false, sourceUrl: PRICING },
    provenance: { c2pa: false, watermark: null },
    // OpenAI's own terms, not Microsoft's. Nobody here has read them, so these
    // stay null - unlike the Azure entry below, which was verified today.
    terms: { commercialUse: true, indemnity: null, trainingOptOut: null, sourceUrl: TERMS },
    checkedAt: CHECKED_AT,
  },
  {
    key: "gpt-image-1",
    adapter: "openai",
    vendorModelId: "gpt-image-1",
    label: "GPT Image 1",
    kind: "image",
    // scene_still only — media-models.md §3 lists GPT Image as a scene_still
    // alternate and keeps it out of product_still, where fidelity is the bar.
    jobs: ["scene_still"],
    io: {
      inputs: { text: true },
      outputs: {
        container: "png",
        resolutions: Object.values(GPT_IMAGE_1_SIZES),
        aspects: Object.keys(GPT_IMAGE_1_SIZES),
        audio: "none",
        // Documented as 1–10. Our own UI caps lower; the model's ceiling is this.
        count: { min: 1, max: 10 },
        delivery: "bytes",
      },
    },
    cost: { unit: "images", amountUsd: null, verified: false, sourceUrl: PRICING },
    provenance: { c2pa: false, watermark: null },
    terms: { commercialUse: true, indemnity: null, trainingOptOut: null, sourceUrl: TERMS },
    // Azure reports inference-deprecation on this date. Set here so routing stops
    // choosing it ON that date rather than on the morning it starts failing — and
    // so a media_job from before it still resolves to a readable name forever.
    retiredAt: "2026-10-23",
    checkedAt: CHECKED_AT,
  },
];

export const AZURE_OPENAI_MODELS: ModelDescriptor[] = [
  {
    key: "azure-gpt-image-2",
    adapter: "azure-openai",
    // The MODEL, pinned. What the Azure account calls its deployment is a
    // separate thing entirely (AZURE_OPENAI_IMAGE_DEPLOYMENT).
    vendorModelId: "gpt-image-2",
    label: "GPT Image 2 (Azure)",
    kind: "image",
    jobs: ["scene_still"],
    io: {
      inputs: { text: true },
      outputs: {
        container: "png",
        resolutions: Object.values(GPT_IMAGE_2_SIZES),
        aspects: Object.keys(GPT_IMAGE_2_SIZES),
        audio: "none",
        count: { min: 1, max: 10 },
        delivery: "bytes",
      },
    },
    /*
     * Azure bills this model PER TOKEN, not per image — there is no per-image
     * meter on the price list at all. So `amountUsd` stays null (a deployment
     * supplies its own rounded per-image rate for the pre-flight estimate) and
     * the real money is computed from the usage the API reports back.
     *
     * Rates read from AZURE_PRICING on 2026-08-31, GlobalStandard, USD:
     *   Image 2 txt inp Gl  $5.00 / 1M   (prompt)
     *   Image 2 img opt Gl  $30.00 / 1M  (the generated image)
     *
     * Measured against this deployment the same day, so the per-image rate a
     * deployment configures is grounded rather than guessed. Output tokens
     * track CONTENT, not just size:
     *   plain backdrop   1088x1088  medium    204 tokens   $0.006
     *   plain backdrop   1088x1936  medium    148 tokens   $0.004
     *   busy night scene 1088x1936  medium   1331 tokens   $0.040
     *   busy night scene 1088x1936  high     5322 tokens   $0.160
     * `medium` is the default this adapter gets, because it never sends one.
     */
    cost: {
      unit: "images",
      amountUsd: null,
      verified: false,
      sourceUrl: AZURE_PRICING,
      tokenRates: { inputUsdPerMillion: 5.0, outputUsdPerMillion: 30.0 },
    },
    // Unverified and deliberately conservative: 12.5a probes the bytes and
    // records what is actually there, so this field never overstates.
    provenance: { c2pa: false, watermark: null },
    // Same weights, processed under the Azure agreement rather than OpenAI's.
    // trainingOptOut VERIFIED 2026-08-30 against DATA_PRIVACY: prompts and
    // completions are not available to OpenAI, are not used to improve any
    // provider's models, and are not used to train foundation models. That is a
    // property of Azure, not of the model - hence true here and null above.
    terms: { commercialUse: true, indemnity: null, trainingOptOut: true, sourceUrl: DATA_PRIVACY },
    checkedAt: CHECKED_AT,
  },
];

/** The api-version the images data plane requires. Confirmed against DOCS. */
export const AZURE_IMAGES_API_VERSION = "2025-04-01-preview";

export { DOCS as OPENAI_IMAGES_DOCS };

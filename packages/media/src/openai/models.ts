/*
 * OpenAI image models.
 *
 * Verified 2026-08-28 against OpenAI's own docs — request/response shape only:
 *   POST /v1/images/generations  { model, prompt, n, size }
 *   sizes 1024x1024 | 1536x1024 | 1024x1536, reply { data: [{ b64_json }] }
 *
 * Everything below that a person has NOT read off a vendor page is null/false
 * rather than guessed: the per-image rate (research records $0.009–0.20 from
 * fal's catalogue, a third-party range, not OpenAI's number), indemnity,
 * training opt-out, and whether outputs carry a C2PA manifest.
 *
 * ai-media-2026.md §4 records a cheaper GPT Image 1.5 generation. It is absent
 * on purpose: nobody has read its vendor id off the page.
 */
import type { ModelDescriptor } from "../io";

const DOCS = "https://developers.openai.com/api/docs/guides/image-generation.md";
const PRICING = "https://openai.com/api/pricing/";
const TERMS = "https://openai.com/policies/services-agreement/";

/** Read off DOCS on this date. Ages into the staleness sweep (isStale). */
const CHECKED_AT = "2026-08-28";

export const OPENAI_MODELS: ModelDescriptor[] = [
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
        resolutions: ["1024x1024", "1536x1024", "1024x1536"],
        aspects: ["1:1", "3:2", "2:3"],
        audio: "none",
        count: { min: 1, max: 4 },
        delivery: "bytes",
      },
    },
    cost: { unit: "images", amountUsd: null, verified: false, sourceUrl: PRICING },
    // false = we make no claim. 12.5 replaces this with a probe of the bytes,
    // which is the only honest answer for a credential we did not attach.
    provenance: { c2pa: false, watermark: null },
    terms: { commercialUse: true, indemnity: null, trainingOptOut: null, sourceUrl: TERMS },
    checkedAt: CHECKED_AT,
  },
];

const AZURE_TERMS = "https://azure.microsoft.com/en-us/support/legal/";

/**
 * The SAME model, reached through Azure OpenAI instead of OpenAI directly.
 *
 * A separate key because `media_job.model_key` must resolve forever: a job that
 * ran on Azure has to read back as Azure, not be retconned when a deployment
 * moves. `vendorModelId` is unchanged and becomes the DEPLOYMENT NAME in the URL
 * path — which is why the deployment must be named after the model, and why the
 * registry rule "pinned, never constructed" still holds.
 *
 * Terms differ even though the weights do not: processing happens under the
 * Azure agreement, in the tenant's own region.
 */
const onAzure = (m: ModelDescriptor): ModelDescriptor => ({
  ...m,
  key: `azure-${m.key}`,
  adapter: "azure-openai",
  label: `${m.label} (Azure)`,
  terms: { ...m.terms, sourceUrl: AZURE_TERMS },
});

export const AZURE_OPENAI_MODELS: ModelDescriptor[] = OPENAI_MODELS.map(onAzure);

export const OPENAI_IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

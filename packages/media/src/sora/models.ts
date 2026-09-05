/*
 * Sora 2 on Azure. Read from Microsoft Learn on 2026-09-01, not from memory —
 * this repo's earlier note said Sora takes "16 or 20 seconds and nothing else",
 * which is the OpenAI-native contract and NOT what Azure accepts.
 *
 * https://learn.microsoft.com/azure/ai-foundry/openai/video-generation-quickstart
 */
import type { ModelDescriptor } from "../io";

const SOURCE = "https://learn.microsoft.com/azure/ai-foundry/openai/concepts/video-generation";
const CHECKED_AT = "2026-09-01";

/** The two Azure accepts for text-to-video. Portrait first: it is the social default. */
export const SORA_SIZES: Record<string, string> = { "9:16": "720x1280", "16:9": "1280x720" };

export const SORA_MODELS: ModelDescriptor[] = [
  {
    key: "azure-sora-2",
    adapter: "azure-sora",
    // The MODEL. What this account calls its deployment is separate
    // (AZURE_OPENAI_VIDEO_DEPLOYMENT) and rides in the request BODY, unlike
    // images, where the deployment is a URL path segment.
    vendorModelId: "sora-2",
    label: "Sora 2 (Azure)",
    kind: "video",
    // Single clips only. A multi-shot `sequence` is assembled from several of
    // these by lib/media/video/assemble.ts, not asked of the model.
    jobs: ["product_motion", "hero_shot", "broll"],
    io: {
      /*
       * ONE reference image, and "source" is MEASURED, not assumed.
       *
       * A multipart POST carrying `input_reference` was accepted on 2026-09-01,
       * and the output's FIRST FRAME was the reference byte-for-byte — a flat
       * violet plate — which then animated into a violet object. So this is a
       * literal opening frame the model moves on from, not a subject it looks
       * at and reinterprets. That distinction decides how it is used: hand it a
       * product packshot and the real product is genuinely on screen, so the
       * packshot has to work as frame one.
       *
       * The descriptor previously said `text` only, so the resolver dropped
       * every reference before it could reach the vendor.
       *
       * The image must match the requested `size`; Sora does not letterbox.
       */
      inputs: { text: true, referenceImages: { max: 1, role: "source" } },
      outputs: {
        container: "mp4",
        resolutions: Object.values(SORA_SIZES),
        aspects: Object.keys(SORA_SIZES),
        // `allowed`, not min/max: 6 seconds is a 400, not a rounded 8.
        duration: { min: 4, max: 12, allowed: [4, 8, 12] },
        // Sora returns one MP4 with the audio already in it, so there is no
        // separate track to mix and the assembly graph must not add one.
        audio: "embedded",
        count: { min: 1, max: 1 },
        delivery: "url",
        // MEASURED, not assumed: expires_at came back exactly 24h after
        // created_at on a real job (2026-09-01). Still fetched on completion
        // rather than on demand — a day is a deadline, not an absence of one.
        urlTtlSeconds: 86_400,
      },
    },
    /*
     * PER SECOND, and unlike images the vendor reports NO usage at all — the
     * video object carries `seconds` and nothing else. So there
     * is no `tokenRates` here: the billed quantity is exactly what we asked
     * for, which makes the cost arithmetic exact rather than an estimate.
     *
     * `amountUsd` stays null because Azure publishes no retail meter for sora
     * (checked against the price API on 2026-09-01, zero matching items). The
     * deployment supplies the per-second rate through AI_MEDIA_RATES_JSON, the
     * same way it does for images.
     */
    cost: { unit: "video_seconds", amountUsd: null, verified: false, sourceUrl: SOURCE },
    // Every Sora 2 video is C2PA-signed. That is the vendor's CLAIM; the bytes
    // are probed on arrival and a disagreement is recorded, not trusted.
    // "vendor" is the vocabulary's word for a watermark the vendor applies;
    // Sora's is a visible moving mark, not an invisible one like SynthID.
    provenance: { c2pa: true, watermark: "vendor" },
    terms: {
      commercialUse: true,
      // Azure's terms do not state an indemnity for video output. Null is "the
      // vendor does not say", which is not the same as false.
      indemnity: null,
      trainingOptOut: null,
      sourceUrl: SOURCE,
    },
    checkedAt: CHECKED_AT,
    /*
     * Azure retires sora-2 (2025-12-08) on this date with no listed
     * replacement, and OpenAI shuts the whole Videos API on 2026-09-24
     * (both read off the vendors' own retirement pages, 2026-09-01 —
     * docs/research/generation-competitors-2026.md §0). isRetired() treats a
     * future date as "still live", so routing drops this row by itself on the
     * day, and Kling (fal) is already ahead of it in catalog order.
     */
    retiredAt: "2026-10-15",
  },
];

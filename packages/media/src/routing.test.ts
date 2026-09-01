import { describe, expect, it } from "vitest";
import { isRouted, routeJob, type RoutingPolicy } from "./routing";
import type { GenerationSpec } from "./types";

const all = () => true;
const none = () => false;
const spec = (over: Partial<GenerationSpec> = {}): GenerationSpec => ({ jobKind: "hero_shot", prompt: "a hero shot", ...over });

describe("routeJob", () => {
  it("picks a model that can serve the job and explains why", () => {
    const r = routeJob(spec(), { isConfigured: all });
    expect(isRouted(r)).toBe(true);
    if (!isRouted(r)) return;
    expect(r.model.key).toBe("mock-video");
    expect(r.reason).toContain("Mock video");
  });

  it("refuses when no adapter is configured, naming the adapter", () => {
    const r = routeJob(spec(), { isConfigured: none });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("mock adapter isn't configured");
  });

  it("rejects a duration the model does not accept, and says what it does accept", () => {
    const r = routeJob(spec({ durationSeconds: 7 }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("4 or 8");
  });

  it("accepts a duration the model declares", () => {
    expect(isRouted(routeJob(spec({ durationSeconds: 8 }), { isConfigured: all }))).toBe(true);
  });

  it("honours a per-request pin", () => {
    const r = routeJob(spec({ jobKind: "product_still", modelKey: "mock-image" }), { isConfigured: all });
    expect(isRouted(r) && r.reason).toContain("pinned");
  });

  it("refuses a pin that cannot do the job rather than quietly routing elsewhere", () => {
    const r = routeJob(spec({ jobKind: "product_still", modelKey: "mock-video" }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("doesn't do");
  });

  it("errors on an unknown pinned model", () => {
    const r = routeJob(spec({ modelKey: "does-not-exist" }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
  });

  it("respects an excluded model", () => {
    const policy: RoutingPolicy = { excludeModels: ["mock-video"] };
    const r = routeJob(spec(), { isConfigured: all, policy });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("excluded by this workspace");
  });

  it("respects an excluded adapter", () => {
    const r = routeJob(spec(), { isConfigured: all, policy: { excludeAdapters: ["mock"] } });
    expect(isRouted(r)).toBe(false);
  });

  it("treats an unstated indemnity as not satisfying requireIndemnity, and says so precisely", () => {
    const r = routeJob(spec(), { isConfigured: all, policy: { requireIndemnity: true } });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("doesn't state an indemnity");
  });

  it("routes despite more references than the model takes — downsampling is the caller's job, not routing's", () => {
    const refs = Array.from({ length: 5 }, (_, i) => ({ assetId: `a${i}`, role: "product" as const }));
    const r = routeJob(spec({ references: refs }), { isConfigured: all });
    expect(isRouted(r)).toBe(true);
  });

  it("rejects a model that takes no reference images at all", () => {
    const r = routeJob(spec({ jobKind: "voiceover", prompt: "read this", references: [{ assetId: "a", role: "product" }] }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("takes no reference images");
  });

  it("rejects footage editing on a model that cannot do it", () => {
    const r = routeJob(spec({ references: [{ assetId: "a", role: "source" }] }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("cannot edit existing footage");
  });

  it("rejects a count above what the model returns per request", () => {
    const r = routeJob(spec({ count: 3 }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("at most 1");
  });

  it("says plainly when nothing does the job yet", () => {
    const r = routeJob(spec({ jobKind: "footage_edit" }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("No model does");
  });

  it("prefers the workspace's chosen model for that job kind", () => {
    const r = routeJob(spec({ jobKind: "product_still" }), { isConfigured: all, policy: { prefer: { product_still: "mock-image" } } });
    expect(isRouted(r) && r.reason).toContain("preferred by this workspace");
  });
  it("rejects an aspect the model does not render, rather than squaring it silently", () => {
    const r = routeJob(spec({ jobKind: "scene_still", aspect: "21:9" }), { isConfigured: all });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("not 21:9");
  });

  it("ignores aspect for a model that has none — audio has no shape", () => {
    const r = routeJob(spec({ jobKind: "voiceover", aspect: "1:1", durationSeconds: 10 }), { isConfigured: all });
    expect(isRouted(r) && r.model.key).toBe("mock-audio");
  });
});

describe("routing with a real adapter registered", () => {
  const onlyOpenAi = (adapter: string) => adapter === "openai";

  it("routes a scene still to GPT Image when it is the only thing configured", () => {
    const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: onlyOpenAi });
    // The LIVE model, not the one retiring on 2026-10-23 that sits behind it.
    expect(isRouted(r) && r.model.key).toBe("gpt-image-2");
    expect(isRouted(r) && r.reason).toContain("mock-image the mock adapter isn't configured");
  });

  it("prefers the mock locally, so a dev box with both keys spends nothing", () => {
    const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: all });
    expect(isRouted(r) && r.model.key).toBe("mock-image");
  });

  it("will NOT route a product still to it — fidelity is a different job", () => {
    const r = routeJob(spec({ jobKind: "product_still" }), { isConfigured: onlyOpenAi });
    expect(isRouted(r)).toBe(false);
  });

  it("refuses it when the workspace requires an indemnity the vendor doesn't state", () => {
    const policy: RoutingPolicy = { requireIndemnity: true };
    const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: onlyOpenAi, policy });
    expect(isRouted(r)).toBe(false);
    if (isRouted(r)) return;
    expect(r.error).toContain("doesn't state an indemnity");
  });
  it("prefers AZURE over the direct vendor when both are configured", () => {
    const bothOpenAi = (a: string) => a === "openai" || a === "azure-openai";
    const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: bothOpenAi });
    expect(isRouted(r) && r.model.key).toBe("azure-gpt-image-2");
    expect(isRouted(r) && r.model.adapter).toBe("azure-openai");
  });

  it("falls back to the direct vendor when Azure isn't configured", () => {
    const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: onlyOpenAi });
    expect(isRouted(r) && r.model.key).toBe("gpt-image-2");
  });

  it("never routes to the retired gpt-image-1, before or after its date", () => {
    for (const now of [new Date("2026-09-01"), new Date("2026-11-01")]) {
      const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: onlyOpenAi, now });
      expect(isRouted(r) && r.model.key, now.toISOString()).toBe("gpt-image-2");
    }
  });

  it("keeps the deployment name pinned — Azure's path segment is the model id", () => {
    const r = routeJob(spec({ jobKind: "scene_still" }), { isConfigured: (a) => a === "azure-openai" });
    expect(isRouted(r) && r.model.vendorModelId).toBe("gpt-image-2");
  });
});

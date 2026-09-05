/*
 * The rules worth pinning: acceptance follows the fingerprint, so an edit
 * reopens the draft; and only accepted placements pass the flatten gate.
 */
import { describe, expect, it } from "vitest";
import { readBrandKit } from "@/lib/brand/read";
import type { BrandKit } from "@/lib/brand/types";
import { acceptanceStatuses, unacceptedFor, withAcceptances } from "./acceptance";
import { starterPlan } from "./starter";
import type { AdPlan } from "./types";

const plan = (): AdPlan =>
  starterPlan({ objective: "sales", title: "Spring", placements: ["meta_reels_9x16"], headline: "Half price", cta: "Shop now", assetId: "a1" });

const kit = (): BrandKit => {
  const base = readBrandKit({});
  return {
    ...base,
    visual: {
      ...base.visual,
      palette: [
        { name: "Ink", hex: "#0a0a0a", role: "text", note: "" },
        { name: "Paper", hex: "#ffffff", role: "surface", note: "" },
        { name: "Brand", hex: "#0a0a0a", role: "primary", note: "" },
      ],
      typography: { headingFamily: "Inter", bodyFamily: "Inter", weights: "", licenceNote: "" },
    },
  };
};

describe("acceptanceStatuses", () => {
  it("a fresh plan is unaccepted — nobody said yes through a gate that didn't exist", () => {
    expect(acceptanceStatuses(plan(), kit())).toEqual([{ placement: "meta_reels_9x16", state: "unaccepted" }]);
  });

  it("accepting stamps the current fingerprint, and the status says accepted", () => {
    const accepted = withAcceptances(plan(), kit(), ["meta_reels_9x16"], "user-1");
    expect("plan" in accepted).toBe(true);
    if (!("plan" in accepted)) return;
    const [status] = acceptanceStatuses(accepted.plan, kit());
    expect(status.state).toBe("accepted");
    expect(accepted.plan.acceptances[0].acceptedByUserId).toBe("user-1");
  });

  it("an edit after acceptance makes it STALE — the draft reopens instead of re-flattening changed work", () => {
    const accepted = withAcceptances(plan(), kit(), ["meta_reels_9x16"], "user-1");
    if (!("plan" in accepted)) throw new Error("acceptance failed");
    const edited = { ...accepted.plan };
    (edited.overlays.find((o) => o.kind === "text") as { text: string }).text = "Edited after acceptance";
    expect(acceptanceStatuses(edited, kit())[0].state).toBe("stale");
  });
});

describe("unacceptedFor — the flatten gate", () => {
  it("blocks everything on a fresh plan and nothing on an accepted one", () => {
    expect(unacceptedFor(plan(), kit(), ["meta_reels_9x16"])).toEqual(["meta_reels_9x16"]);
    const accepted = withAcceptances(plan(), kit(), ["meta_reels_9x16"], "user-1");
    if (!("plan" in accepted)) throw new Error("acceptance failed");
    expect(unacceptedFor(accepted.plan, kit(), ["meta_reels_9x16"])).toEqual([]);
  });

  it("a stale acceptance blocks again", () => {
    const accepted = withAcceptances(plan(), kit(), ["meta_reels_9x16"], "user-1");
    if (!("plan" in accepted)) throw new Error("acceptance failed");
    (accepted.plan.overlays.find((o) => o.kind === "text") as { text: string }).text = "Edited";
    expect(unacceptedFor(accepted.plan, kit(), ["meta_reels_9x16"])).toEqual(["meta_reels_9x16"]);
  });
});

describe("withAcceptances", () => {
  it("re-accepting replaces the old stamp rather than accumulating history — the audit log keeps that", () => {
    const first = withAcceptances(plan(), kit(), ["meta_reels_9x16"], "user-1", new Date("2026-09-01T10:00:00Z"));
    if (!("plan" in first)) throw new Error("acceptance failed");
    const second = withAcceptances(first.plan, kit(), ["meta_reels_9x16"], "user-2", new Date("2026-09-01T11:00:00Z"));
    if (!("plan" in second)) throw new Error("acceptance failed");
    expect(second.plan.acceptances).toHaveLength(1);
    expect(second.plan.acceptances[0].acceptedByUserId).toBe("user-2");
  });

  it("refuses a placement with nothing renderable, naming it", () => {
    const p = plan();
    const result = withAcceptances(p, kit(), ["meta_feed_1x1"], "user-1");
    expect(result).toHaveProperty("error");
  });
});

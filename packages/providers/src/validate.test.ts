import { describe, expect, it } from "vitest";
import { validateAgainstCapabilities } from "./validate";
import type { Capabilities } from "./types";

const caps: Capabilities = {
  formats: ["text", "image", "video"],
  scheduling: "internal",
  limits: { textMaxChars: 100, imagesMax: 2, videoMaxSeconds: 60, videoMaxBytes: 1000, imageMaxBytes: 500, hashtagsMax: 3, firstComment: false, links: "none", altText: true },
  inbox: { comments: true, mentions: false, messages: false, reviews: false, reply: true },
  insights: { organic: true, audience: false },
  ads: { import: false, manage: false },
  ingestion: { webhooks: false, polling: true },
  checkedAt: "2026-01-01T00:00:00Z",
};
const img = (extra: Partial<{ bytes: number; altText: string }> = {}) => ({ url: "https://x/i.jpg", mimeType: "image/jpeg", ...extra });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("validateAgainstCapabilities", () => {
  it("passes a well-formed text post", () => {
    expect(validateAgainstCapabilities(caps, { format: "text", text: "hello #one", media: [] })).toEqual([]);
  });

  it("rejects unsupported formats and overlong text", () => {
    const issues = validateAgainstCapabilities(caps, { format: "carousel", text: "x".repeat(101), media: [img({ altText: "a" })] });
    expect(codes(issues)).toEqual(expect.arrayContaining(["format_unsupported", "text_too_long"]));
  });

  it("enforces media counts, sizes and required media per format", () => {
    expect(codes(validateAgainstCapabilities(caps, { format: "image", text: "", media: [] }))).toContain("image_required");
    expect(codes(validateAgainstCapabilities(caps, { format: "video", text: "", media: [] }))).toContain("video_required");
    const many = validateAgainstCapabilities(caps, { format: "image", text: "", media: [img({ altText: "a" }), img({ altText: "b" }), img({ altText: "c" })] });
    expect(codes(many)).toContain("too_many_images");
    const big = validateAgainstCapabilities(caps, { format: "image", text: "", media: [img({ bytes: 501, altText: "a" })] });
    expect(codes(big)).toContain("image_too_large");
    const vid = validateAgainstCapabilities(caps, { format: "video", text: "", media: [{ url: "https://x/v.mp4", mimeType: "video/mp4", bytes: 2000, durationSeconds: 61 }] });
    expect(codes(vid)).toEqual(expect.arrayContaining(["video_too_long", "video_too_large"]));
  });

  it("warns on missing alt text and non-clickable links; errors on unsupported first comment", () => {
    const issues = validateAgainstCapabilities(caps, { format: "image", text: "", media: [img()], link: "https://x", firstComment: "hi" });
    expect(issues.find((i) => i.code === "alt_text_missing")?.severity).toBe("warning");
    expect(issues.find((i) => i.code === "link_not_clickable")?.severity).toBe("warning");
    expect(issues.find((i) => i.code === "first_comment_unsupported")?.severity).toBe("error");
  });

  it("counts hashtags including non-latin ones", () => {
    expect(codes(validateAgainstCapabilities(caps, { format: "text", text: "#a #b #c #日本", media: [] }))).toContain("too_many_hashtags");
  });
});

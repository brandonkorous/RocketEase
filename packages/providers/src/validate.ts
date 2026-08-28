import type { Capabilities, PublishRequest, ValidationIssue } from "./types";

/**
 * Generic, capability-driven validation every adapter runs before its own
 * provider-specific checks. Keeps "unsupported field disabled with an
 * explanation" (content-model.md) consistent across networks.
 */
export function validateAgainstCapabilities(caps: Capabilities, req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { limits } = caps;

  if (!caps.formats.includes(req.format)) {
    issues.push({ severity: "error", code: "format_unsupported", message: `This channel can't publish ${req.format} posts.`, field: "media" });
  }
  if (limits.textMaxChars !== undefined && req.text.length > limits.textMaxChars) {
    issues.push({
      severity: "error",
      code: "text_too_long",
      message: `Text is ${req.text.length - limits.textMaxChars} characters over the ${limits.textMaxChars} limit.`,
      field: "text",
    });
  }
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  const videos = req.media.filter((m) => m.mimeType.startsWith("video/"));
  if (limits.imagesMax !== undefined && images.length > limits.imagesMax) {
    issues.push({ severity: "error", code: "too_many_images", message: `At most ${limits.imagesMax} images per post here.`, field: "media" });
  }
  if ((req.format === "image" || req.format === "carousel") && images.length === 0) {
    issues.push({ severity: "error", code: "image_required", message: "Add at least one image for this format.", field: "media" });
  }
  if ((req.format === "video" || req.format === "reel") && videos.length !== 1) {
    issues.push({ severity: "error", code: "video_required", message: "This format needs exactly one video.", field: "media" });
  }
  for (const v of videos) {
    if (limits.videoMaxSeconds && v.durationSeconds && v.durationSeconds > limits.videoMaxSeconds)
      issues.push({ severity: "error", code: "video_too_long", message: `Video must be under ${limits.videoMaxSeconds}s.`, field: "media" });
    if (limits.videoMaxBytes && v.bytes && v.bytes > limits.videoMaxBytes)
      issues.push({ severity: "error", code: "video_too_large", message: "Video exceeds the size limit for this channel.", field: "media" });
  }
  for (const i of images) {
    if (limits.imageMaxBytes && i.bytes && i.bytes > limits.imageMaxBytes)
      issues.push({ severity: "error", code: "image_too_large", message: "An image exceeds the size limit for this channel.", field: "media" });
    if (limits.altText && !i.altText)
      issues.push({ severity: "warning", code: "alt_text_missing", message: "Add alt text so the image is accessible.", field: "media" });
  }
  if (req.link && limits.links === "none") {
    issues.push({ severity: "warning", code: "link_not_clickable", message: "Links aren't clickable on this network; consider a link in bio or first comment.", field: "link" });
  }
  if (req.firstComment && !limits.firstComment) {
    issues.push({ severity: "error", code: "first_comment_unsupported", message: "First comment isn't supported on this channel.", field: "firstComment" });
  }
  const hashtags = (req.text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (limits.hashtagsMax !== undefined && hashtags > limits.hashtagsMax) {
    issues.push({ severity: "error", code: "too_many_hashtags", message: `Use at most ${limits.hashtagsMax} hashtags.`, field: "text" });
  }
  return issues;
}

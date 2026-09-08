/*
 * Google Business Profile posts (M14.8): localPosts on a location.
 *   POST /v4/{location}/localPosts            → LocalPost { name, state, searchUrl, createTime }
 *   GET  /v4/{location}/localPosts/{id}       → state: LIVE, PROCESSING, SCHEDULED, REJECTED
 *   GET  /v4/{location}/localPosts?pageSize=  → reconciliation scan
 * Google gives a post no client reference and no idempotency key, so an
 * ambiguous create is reconciled by scanning the location's newest posts for
 * the attempt's text at or after the attempt started — never by resending.
 * Reference: developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
 */
import type { ChannelDescriptor, Credential, PublicationStatus, PublishRequest, PublishResult, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { gbp, now } from "./client";
import { BUTTON_LABEL, type GbpPostSettings, type TopicType } from "./post-fields";

export type { GbpPostSettings } from "./post-fields";

export type LocalPost = { name?: string; state?: string; searchUrl?: string; createTime?: string; summary?: string; topicType?: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const gDate = (s: string | undefined) => { const m = DATE_RE.exec(s ?? ""); return m ? { year: +m[1], month: +m[2], day: +m[3] } : undefined; };
const gTime = (s: string | undefined) => { const m = TIME_RE.exec(s ?? ""); return m ? { hours: +m[1], minutes: +m[2] } : undefined; };

export const settingsOf = (req: Pick<PublishRequest, "settings">) => (req.settings ?? {}) as GbpPostSettings;
export const topicOf = (s: GbpPostSettings): TopicType => s.topicType ?? "STANDARD";
/** The button's link: its own, else the post link. */
export const ctaUrl = (req: Pick<PublishRequest, "settings" | "link">) => settingsOf(req).callToAction?.url?.trim() || req.link;

function callToAction(req: Pick<PublishRequest, "settings" | "link">) {
  const cta = settingsOf(req).callToAction;
  if (cta) {
    if (cta.actionType === "NONE") return undefined;
    // "This field should be left unset for Call CTA" (CallToAction reference).
    return cta.actionType === "CALL" ? { actionType: "CALL" } : { actionType: cta.actionType, url: ctaUrl(req) };
  }
  // No button chosen: a post link still gets a way to be reached.
  return req.link ? { actionType: "LEARN_MORE", url: req.link } : undefined;
}

/** The LocalPost body Google takes. Event details are "Required for EVENT and OFFER topic types" (LocalPost reference). */
export function postBody(req: Omit<PublishRequest, "idempotencyKey">): Record<string, unknown> {
  const s = settingsOf(req);
  const topic = topicOf(s);
  const photo = req.media.find((m) => m.mimeType.startsWith("image/"));
  const body: Record<string, unknown> = { languageCode: s.languageCode?.trim() || "en-US", summary: req.text, topicType: topic };
  const cta = callToAction(req);
  if (cta) body.callToAction = cta;
  if (topic !== "STANDARD") {
    const e = s.event ?? {};
    body.event = { title: e.title?.trim(), schedule: { startDate: gDate(e.startDate), startTime: gTime(e.startTime), endDate: gDate(e.endDate), endTime: gTime(e.endTime) } };
  }
  if (topic === "OFFER" && s.offer) body.offer = { couponCode: s.offer.couponCode?.trim() || undefined, redeemOnlineUrl: s.offer.redeemOnlineUrl?.trim() || undefined, termsConditions: s.offer.termsConditions?.trim() || undefined };
  if (photo) body.media = [{ mediaFormat: "PHOTO", sourceUrl: photo.url }];
  return body;
}

const err = (code: string, message: string, field: ValidationIssue["field"] = "settings"): ValidationIssue => ({ severity: "error", code, message, field });

/** Post rules the capability validator has no field for: what Google's editor requires of each post type. */
export function postIssues(req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const s = settingsOf(req);
  const topic = topicOf(s);
  const issues: ValidationIssue[] = [];
  if (!req.text.trim() && !req.media.some((m) => m.mimeType.startsWith("image/"))) issues.push(err("empty_post", "A Business Profile post needs text or a photo.", "text"));
  const cta = s.callToAction;
  if (cta && cta.actionType !== "NONE" && cta.actionType !== "CALL" && !ctaUrl(req)) issues.push(err("button_needs_link", `A “${BUTTON_LABEL[cta.actionType]}” button needs a link: give it one, or add a post link.`));
  if (topic !== "STANDARD") {
    const e = s.event ?? {};
    const what = topic === "EVENT" ? "An event" : "An offer";
    if (!e.title?.trim()) issues.push(err("event_title_required", `${what} needs a title.`));
    const timesOk = (!e.startTime || Boolean(gTime(e.startTime))) && (!e.endTime || Boolean(gTime(e.endTime)));
    if (!timesOk) issues.push(err("event_time_invalid", "Times are HH:MM, 24-hour."));
    if (!gDate(e.startDate) || !gDate(e.endDate)) issues.push(err("event_dates_required", `${what} needs a start date and an end date.`));
    else if (timesOk && `${e.endDate}T${e.endTime ?? "00:00"}` < `${e.startDate}T${e.startTime ?? "00:00"}`) issues.push(err("event_ends_before_start", `${what} cannot end before it starts.`));
  }
  if (req.media.some((m) => m.mimeType.startsWith("video/"))) issues.push(err("video_unsupported", "Google's local post media is documented with photos only; remove the video.", "media"));
  return issues;
}

type Attempt = { text: string; startedAt: string };
/** Attempts this process started, for the reconciliation scan. */
const attempts = new Map<string, Attempt>();

function resultOf(p: LocalPost): PublishResult {
  if (!p.name) throw new ProviderError("Google returned no post name", { category: "unknown", ambiguous: true });
  if (p.state === "REJECTED") throw new ProviderError("Google rejected this post, so it is not shown. Check Google's posts content policy, edit the post and try again.", { category: "policy", providerCode: "REJECTED" });
  return { remoteId: p.name, url: p.searchUrl, publishedAt: p.createTime ?? now() };
}

export async function publish(cred: Credential, ch: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  attempts.set(req.idempotencyKey, { text: req.text, startedAt: now() });
  const res = await gbp<LocalPost>(`/${ch.remoteId}/localPosts`, cred.accessToken, { method: "POST", body: postBody(req) });
  return resultOf(res.body);
}

/** Our own post on this location: same text, created at or after the attempt started. */
export async function findPublication(cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const attempt = attempts.get(idempotencyKey);
  if (!attempt) return null;
  const res = await gbp<{ localPosts?: LocalPost[] }>(`/${ch.remoteId}/localPosts`, cred.accessToken, { query: { pageSize: "20" } }).catch(() => ({ body: { localPosts: [] as LocalPost[] } }));
  const hit = (res.body.localPosts ?? []).find((p) => (p.summary ?? "") === attempt.text && (!p.createTime || p.createTime >= attempt.startedAt));
  return hit?.name ? { remoteId: hit.name, url: hit.searchUrl, publishedAt: hit.createTime ?? now() } : null;
}

/** LIVE is published; PROCESSING and SCHEDULED are on their way; REJECTED keeps the object but shows nothing, which the platform has no state for yet. */
export async function publicationStatus(cred: Credential, remoteId: string): Promise<PublicationStatus> {
  try {
    const r = await gbp<LocalPost>(`/${remoteId}`, cred.accessToken);
    if (r.body.state === "LIVE") return { state: "published", url: r.body.searchUrl };
    if (r.body.state === "PROCESSING" || r.body.state === "SCHEDULED") return { state: "processing" };
    return { state: "unknown" };
  } catch (e) {
    return e instanceof ProviderError && e.category === "deleted" ? { state: "deleted" } : { state: "unknown" };
  }
}

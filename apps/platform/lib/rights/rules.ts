/*
 * Rights & authorisation clocks (trends-2026 §4). Pure: no db, no clock
 * reads beyond the `now` argument, so the composer, the promote action, the
 * nightly job, and the tests all evaluate exactly the same rules.
 */
import { day } from "./format";
import { DAY_MS, KIND_LABEL, SCOPE_LABEL, WARN_DAYS, type Clock, type RightsAsset, type RightsGrant, type RightsProblem, type RightsScope } from "./types";

type Subject = { channelId?: string | null; timeZone?: string };
type Need = "organic" | "paid";
type Phrase = { at: string; until: string };

const covers = (scope: RightsScope, need: Need) => scope === "both" || scope === need;
const NEED_LABEL: Record<Need, string> = { organic: "organic posting", paid: "paid promotion" };
const NEED_FIX: Record<Need, string> = { organic: "organic clearance", paid: "a paid usage licence" };

/** Normalize an asset's own rights and every grant that covers this use into one list. */
export function clocksFor(assets: RightsAsset[], grants: RightsGrant[], subject: Subject): Clock[] {
  const ids = new Set(assets.map((a) => a.id));
  const out: Clock[] = [];
  for (const a of assets) {
    if (!a.rightsExpiresAt && a.rightsScope === "both") continue; // nothing recorded to enforce
    out.push({
      id: `asset:${a.id}`,
      what: `Usage rights for ${a.fileName}`,
      scope: a.rightsScope,
      startsAt: null,
      expiresAt: a.rightsExpiresAt,
      revokedAt: null,
      fix: `Renew the licence on ${a.fileName} in Content, or swap the media.`,
    });
  }
  for (const g of grants) {
    const onAsset = g.assetId ? ids.has(g.assetId) : false;
    const onChannel = g.channelId && subject.channelId ? g.channelId === subject.channelId : false;
    if (!onAsset && !onChannel) continue;
    out.push({
      id: `grant:${g.id}`,
      what: `${KIND_LABEL[g.kind]} "${g.label}"${g.creatorHandle ? ` (${g.creatorHandle})` : ""}`,
      scope: g.scope,
      startsAt: g.startsAt,
      expiresAt: g.expiresAt,
      revokedAt: g.revokedAt,
      fix: "Renew it in Settings → Rights and authorisations, or remove the media it covers.",
    });
  }
  return out;
}

function problemFor(c: Clock, need: Need, at: Date, until: Date, phrase: Phrase, tz: string): RightsProblem | null {
  const make = (severity: RightsProblem["severity"], code: string, message: string): RightsProblem => ({ severity, code, message, field: "media", clockId: c.id });
  if (c.revokedAt && c.revokedAt <= until) return make("error", "rights_revoked", `${c.what} was revoked on ${day(c.revokedAt, tz)}. ${c.fix}`);
  if (!covers(c.scope, need))
    return make("error", "rights_scope", `${c.what} covers ${SCOPE_LABEL[c.scope].toLowerCase()} use, not ${NEED_LABEL[need]}. Record ${NEED_FIX[need]} before continuing, or swap the media.`);
  if (c.startsAt && c.startsAt > at) return make("error", "rights_not_started", `${c.what} does not start until ${day(c.startsAt, tz)}, after ${phrase.at} ${day(at, tz)}. Move the date or update the licence.`);
  if (!c.expiresAt) return null;
  if (c.expiresAt < until) return make("error", "rights_expired", `${c.what} expires ${day(c.expiresAt, tz)}, before ${phrase.until} ${day(until, tz)}. ${c.fix}`);
  if (c.expiresAt.getTime() - until.getTime() < WARN_DAYS * DAY_MS)
    return make("warning", "rights_expiring", `${c.what} expires ${day(c.expiresAt, tz)}, within ${WARN_DAYS} days of ${phrase.until} ${day(until, tz)}. ${c.fix}`);
  return null;
}

const evaluate = (clocks: Clock[], need: Need, at: Date, until: Date, phrase: Phrase, tz: string) =>
  clocks.map((c) => problemFor(c, need, at, until, phrase, tz)).filter((p): p is RightsProblem => p !== null);

const PUBLISH: Phrase = { at: "this post publishes on", until: "this post publishes on" };

/**
 * Publishing: every clock must still be live when the post actually goes out,
 * not merely today. `scheduledAt` null means "publish now".
 */
export function rightsProblemsForPublish(subject: Subject, assets: RightsAsset[], grants: RightsGrant[], scheduledAt: Date | null, now = new Date()): RightsProblem[] {
  const at = scheduledAt ?? now;
  return evaluate(clocksFor(assets, grants, subject), "organic", at, at, PUBLISH, subject.timeZone ?? "UTC");
}

export type PromotionWindow = Subject & { startAt: Date; endAt: Date | null };

/**
 * Promotion: paid scope is required and every clock must outlast the flight.
 * With no end date the promotion runs open-ended, so the start is the floor.
 */
export function rightsProblemsForPromotion(window: PromotionWindow, assets: RightsAsset[], grants: RightsGrant[]): RightsProblem[] {
  const until = window.endAt ?? window.startAt;
  const phrase: Phrase = { at: "this promotion starts on", until: window.endAt ? "the promotion ends on" : "this promotion starts on" };
  return evaluate(clocksFor(assets, grants, window), "paid", window.startAt, until, phrase, window.timeZone ?? "UTC");
}

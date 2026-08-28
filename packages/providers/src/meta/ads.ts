/*
 * Meta Marketing API (v21): read-only import of ad accounts, campaigns, ad
 * sets, ads and daily insights, plus a promotion that boosts an existing Page
 * post. Budgets on Meta are minor units (cents); the contract uses major units.
 * Untested live until an app with `ads_read`/`ads_management` exists.
 */
import type { AdAccountDescriptor, AdCampaignFact, AdCreativeFact, AdSetFact, PaidInsightFact, PaidInsightsPage, PaidInsightsRequest, PaidMetric, PaidObjects, PaidObjectStatus, PromotionRequest, PromotionResult } from "../ads-types";
import type { Credential, ProviderConfig } from "../types";
import { graph } from "./graph";

type Node = Record<string, unknown> & { id: string };
type Page<T> = { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } };
const act = (a: AdAccountDescriptor) => `/act_${a.remoteId}`;
const minor = (v: unknown) => (v == null || v === "" ? undefined : Number(v) / 100);
const str = (v: unknown) => (v == null ? undefined : String(v));
const manager = (accountId: string, objectId?: string) => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId}${objectId ? `&selected_campaign_ids=${objectId}` : ""}`;

const STATUS: Record<string, PaidObjectStatus> = { ACTIVE: "active", PAUSED: "paused", CAMPAIGN_PAUSED: "paused", ADSET_PAUSED: "paused", PENDING_REVIEW: "in_review", IN_PROCESS: "in_review", DISAPPROVED: "rejected", WITH_ISSUES: "rejected", ARCHIVED: "archived", DELETED: "deleted" };
const toStatus = (n: Node) => STATUS[String(n.effective_status ?? n.status ?? "")] ?? "unknown";
const ACCOUNT_STATUS: Record<number, AdAccountDescriptor["status"]> = { 1: "active", 2: "disabled", 3: "unsettled", 101: "closed" };

async function all<T extends Node>(cfg: ProviderConfig, token: string, path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await graph<Page<T>>(path, cfg, token, { params: { ...params, limit: "100", after } });
    out.push(...(page.data ?? []));
    after = page.paging?.cursors?.after;
    if (!page.paging?.next || !after) break;
  }
  return out;
}

export async function listAdAccounts(cfg: ProviderConfig, cred: Credential): Promise<AdAccountDescriptor[]> {
  const rows = await all<Node>(cfg, cred.accessToken, "/me/adaccounts", { fields: "account_id,name,currency,timezone_name,account_status" });
  return rows.map((r) => ({ remoteId: String(r.account_id), name: String(r.name ?? r.account_id), currency: String(r.currency ?? "USD"), timezone: str(r.timezone_name), status: ACCOUNT_STATUS[Number(r.account_status)] ?? "unknown", managerUrl: manager(String(r.account_id)) }));
}

export async function fetchPaidObjects(cfg: ProviderConfig, cred: Credential, a: AdAccountDescriptor): Promise<PaidObjects> {
  const t = cred.accessToken;
  const [c, s, ads] = await Promise.all([
    all<Node>(cfg, t, `${act(a)}/campaigns`, { fields: "name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time" }),
    all<Node>(cfg, t, `${act(a)}/adsets`, { fields: "name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,targeting{geo_locations,age_min,age_max}" }),
    all<Node>(cfg, t, `${act(a)}/ads`, { fields: "name,adset_id,campaign_id,status,effective_status,preview_shareable_link,creative{effective_object_story_id,thumbnail_url}" }),
  ]);
  const campaigns: AdCampaignFact[] = c.map((n) => ({ remoteId: n.id, name: String(n.name), objective: str(n.objective), status: toStatus(n), dailyBudget: minor(n.daily_budget), lifetimeBudget: minor(n.lifetime_budget), startAt: str(n.start_time), endAt: str(n.stop_time), managerUrl: manager(a.remoteId, n.id) }));
  const adSets: AdSetFact[] = s.map((n) => ({ remoteId: n.id, campaignRemoteId: String(n.campaign_id), name: String(n.name), status: toStatus(n), dailyBudget: minor(n.daily_budget), lifetimeBudget: minor(n.lifetime_budget), targetingSummary: targetingSummary(n.targeting), startAt: str(n.start_time), endAt: str(n.end_time) }));
  const creatives: AdCreativeFact[] = ads.map((n) => {
    const cr = n.creative as { effective_object_story_id?: string; thumbnail_url?: string } | undefined;
    return { remoteId: n.id, adSetRemoteId: String(n.adset_id), campaignRemoteId: String(n.campaign_id), name: String(n.name), status: toStatus(n), promotedPostRemoteId: cr?.effective_object_story_id, previewUrl: str(n.preview_shareable_link), thumbnailUrl: cr?.thumbnail_url };
  });
  return { campaigns, adSets, ads: creatives };
}

function targetingSummary(t: unknown): string | undefined {
  const x = t as { geo_locations?: { countries?: string[] }; age_min?: number; age_max?: number } | undefined;
  if (!x) return undefined;
  const parts = [x.geo_locations?.countries?.join(", "), x.age_min || x.age_max ? `${x.age_min ?? 18}–${x.age_max ?? 65}` : undefined].filter(Boolean);
  return parts.join(" · ") || undefined;
}

const FIELDS = "spend,impressions,reach,inline_link_clicks,post_engagement,video_thruplay_watched_actions,actions";
const CONVERSION_TYPES = ["purchase", "lead", "complete_registration", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "offsite_conversion.fb_pixel_lead"];

function insightFacts(level: "campaign" | "ad", n: Node, currency: string): PaidInsightFact[] {
  const id = String(level === "campaign" ? n.campaign_id : n.ad_id);
  const day = String(n.date_start);
  const push = (metric: PaidMetric, value: unknown, source: string) => (value == null ? null : { entity: level, remoteId: id, metric, day, value: Number(value), currency, source });
  const actions = (n.actions as { action_type: string; value: string }[] | undefined) ?? [];
  const conversions = actions.filter((x) => CONVERSION_TYPES.includes(x.action_type)).reduce((s, x) => s + Number(x.value), 0);
  const thru = (n.video_thruplay_watched_actions as { value: string }[] | undefined)?.reduce((s, x) => s + Number(x.value), 0);
  return [push("spend", n.spend, "meta.spend"), push("impressions", n.impressions, "meta.impressions"), push("reach", n.reach, "meta.reach"), push("link_clicks", n.inline_link_clicks, "meta.inline_link_clicks"), push("engagement", n.post_engagement, "meta.post_engagement"), push("video_views", thru, "meta.video_thruplay_watched_actions"), actions.length ? push("conversions", conversions, `meta.actions[${CONVERSION_TYPES.join("|")}]`) : null].filter((f): f is PaidInsightFact => f !== null);
}

export async function fetchPaidInsights(cfg: ProviderConfig, cred: Credential, a: AdAccountDescriptor, req: PaidInsightsRequest): Promise<PaidInsightsPage> {
  const facts: PaidInsightFact[] = [];
  for (const level of req.levels ?? ["campaign"]) {
    const rows = await all<Node>(cfg, cred.accessToken, `${act(a)}/insights`, { level, time_increment: "1", fields: `${FIELDS},${level}_id,date_start`, time_range: JSON.stringify({ since: req.since, until: req.until }), action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]) });
    for (const n of rows) facts.push(...insightFacts(level, n, a.currency));
  }
  return { facts, currency: a.currency, timezone: a.timezone, attribution: { model: "Meta (last touch)", window: "7-day click, 1-day view" } };
}

const OBJECTIVE: Record<PromotionRequest["objective"], { objective: string; goal: string }> = { engagement: { objective: "OUTCOME_ENGAGEMENT", goal: "POST_ENGAGEMENT" }, traffic: { objective: "OUTCOME_TRAFFIC", goal: "LINK_CLICKS" }, awareness: { objective: "OUTCOME_AWARENESS", goal: "REACH" }, leads: { objective: "OUTCOME_LEADS", goal: "LEAD_GENERATION" }, conversions: { objective: "OUTCOME_SALES", goal: "OFFSITE_CONVERSIONS" } };
const tag = (key: string) => `[mis:${key}]`;

type Tagged = { campaign: Node; adset?: Node; ad?: Node };
async function findTagged(cfg: ProviderConfig, cred: Credential, a: AdAccountDescriptor, key: string): Promise<Tagged | null> {
  const rows = await all<Node>(cfg, cred.accessToken, `${act(a)}/campaigns`, { fields: "name,status,effective_status,created_time,adsets{id,ads{id}}", filtering: JSON.stringify([{ field: "name", operator: "CONTAIN", value: tag(key) }]) });
  const campaign = rows[0];
  if (!campaign) return null;
  const adset = (campaign.adsets as Page<Node & { ads?: Page<Node> }> | undefined)?.data?.[0];
  return { campaign, adset, ad: adset?.ads?.data?.[0] };
}

const toResult = (a: AdAccountDescriptor, t: Required<Tagged>, status: PaidObjectStatus): PromotionResult => ({ campaignRemoteId: t.campaign.id, adSetRemoteId: t.adset.id, adRemoteId: t.ad.id, status, managerUrl: manager(a.remoteId, t.campaign.id), createdAt: String(t.campaign.created_time ?? new Date().toISOString()) });

/**
 * Campaign → ad set → creative → ad. The idempotency key is embedded in the
 * campaign name, so a partially created promotion is resumed, never duplicated.
 */
export async function promote(cfg: ProviderConfig, cred: Credential, a: AdAccountDescriptor, req: PromotionRequest): Promise<PromotionResult> {
  const t = cred.accessToken;
  const o = OBJECTIVE[req.objective];
  const status = req.initialStatus === "active" ? "ACTIVE" : "PAUSED";
  const cents = String(Math.round(req.budget.amount * 100));
  const existing = await findTagged(cfg, cred, a, req.idempotencyKey);
  if (existing?.adset && existing.ad) return toResult(a, existing as Required<Tagged>, req.initialStatus);
  const campaign = existing?.campaign ?? (await graph<Node>(`${act(a)}/campaigns`, cfg, t, { method: "POST", params: { name: `${req.name} ${tag(req.idempotencyKey)}`, objective: o.objective, status, special_ad_categories: "[]" } }));
  const targeting = JSON.stringify({ geo_locations: { countries: req.audience?.countries?.length ? req.audience.countries : ["US"] }, age_min: req.audience?.ageMin ?? 18, age_max: req.audience?.ageMax ?? 65 });
  const adset = existing?.adset ?? (await graph<Node>(`${act(a)}/adsets`, cfg, t, { method: "POST", params: { name: `${req.name} – Audience`, campaign_id: campaign.id, status, billing_event: "IMPRESSIONS", optimization_goal: o.goal, targeting, start_time: req.startAt, end_time: req.endAt, ...(req.budget.kind === "daily" ? { daily_budget: cents } : { lifetime_budget: cents }) } }));
  const creative = await graph<Node>(`${act(a)}/adcreatives`, cfg, t, { method: "POST", params: { name: `${req.name} – Boosted post`, object_story_id: req.sourcePostRemoteId } });
  const ad = await graph<Node>(`${act(a)}/ads`, cfg, t, { method: "POST", params: { name: `${req.name} – Boosted post`, adset_id: adset.id, creative: JSON.stringify({ creative_id: creative.id }), status } });
  return toResult(a, { campaign, adset, ad }, req.initialStatus);
}

/** Only a complete campaign/ad set/ad triple counts as "created"; a partial one is resumed by `promote`. */
export async function findPromotion(cfg: ProviderConfig, cred: Credential, a: AdAccountDescriptor, key: string): Promise<PromotionResult | null> {
  const t = await findTagged(cfg, cred, a, key);
  return t?.adset && t.ad ? toResult(a, t as Required<Tagged>, toStatus(t.campaign)) : null;
}

export async function setPaidObjectStatus(cfg: ProviderConfig, cred: Credential, remoteId: string, status: "active" | "paused") {
  await graph(`/${remoteId}`, cfg, cred.accessToken, { method: "POST", params: { status: status === "active" ? "ACTIVE" : "PAUSED" } });
}

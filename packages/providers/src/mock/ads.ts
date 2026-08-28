/*
 * Mock paid surface: two ad accounts with deterministic campaigns and daily
 * facts (seeded hash) plus an in-memory promotion store so the confirm →
 * create → reconcile loop can be exercised locally without spending anything.
 */
import type { AdAccountDescriptor, AdCampaignFact, PaidInsightFact, PaidInsightsPage, PaidInsightsRequest, PaidMetric, PaidObjects, PromotionRequest, PromotionResult } from "../ads-types";
import { ProviderError } from "../types";
import { unit } from "./insights";

export const MOCK_AD_ACCOUNTS: AdAccountDescriptor[] = [
  { remoteId: "act_mock_1", name: "Demo Brand Ads (USD)", currency: "USD", timezone: "UTC", status: "active", managerUrl: "https://demo.invalid/ads/act_mock_1" },
  { remoteId: "act_mock_2", name: "Demo Brand EU Ads (EUR)", currency: "EUR", timezone: "Europe/Berlin", status: "active", managerUrl: "https://demo.invalid/ads/act_mock_2" },
];

type Promo = PromotionResult & { accountId: string; idempotencyKey: string; request: PromotionRequest };
type Store = { promotions: Map<string, Promo>; behaviour: { ambiguousPromote?: boolean; failPromote?: boolean }; statuses: Map<string, "active" | "paused"> };
const g = globalThis as unknown as { __misMockAds?: Store };
const store = (): Store => (g.__misMockAds ??= { promotions: new Map(), behaviour: {}, statuses: new Map() });

export const mockAds = {
  set(b: Store["behaviour"]) { store().behaviour = { ...store().behaviour, ...b }; },
  reset() { g.__misMockAds = { promotions: new Map(), behaviour: {}, statuses: new Map() }; },
  promotions: () => [...store().promotions.values()],
};

const SEEDED = [
  { suffix: "summer", name: "Summer Collection 2025", objective: "conversions", daily: 120 },
  { suffix: "launch", name: "New Product Launch", objective: "conversions", daily: 90 },
  { suffix: "brand", name: "Brand Awareness – Q2", objective: "awareness", daily: 45 },
];

const status = (id: string): AdCampaignFact["status"] => store().statuses.get(id) ?? "active";

function seededObjects(account: AdAccountDescriptor): PaidObjects {
  const out: PaidObjects = { campaigns: [], adSets: [], ads: [] };
  for (const s of SEEDED) {
    const cid = `${account.remoteId}_c_${s.suffix}`;
    out.campaigns.push({ remoteId: cid, name: s.name, objective: s.objective, status: status(cid), dailyBudget: s.daily, startAt: "2025-05-12T00:00:00Z", managerUrl: `${account.managerUrl}/${cid}` });
    out.adSets.push({ remoteId: `${cid}_s1`, campaignRemoteId: cid, name: `${s.name} – Broad`, status: status(cid), dailyBudget: s.daily, targetingSummary: "US, CA · 25–44" });
    out.ads.push({ remoteId: `${cid}_a1`, adSetRemoteId: `${cid}_s1`, campaignRemoteId: cid, name: `${s.name} – Ad 1`, status: status(cid) });
  }
  return out;
}

function promotedObjects(account: AdAccountDescriptor): PaidObjects {
  const out: PaidObjects = { campaigns: [], adSets: [], ads: [] };
  for (const p of store().promotions.values()) {
    if (p.accountId !== account.remoteId) continue;
    const st = store().statuses.get(p.campaignRemoteId) ?? p.status;
    out.campaigns.push({ remoteId: p.campaignRemoteId, name: p.request.name, objective: p.request.objective, status: st, dailyBudget: p.request.budget.kind === "daily" ? p.request.budget.amount : undefined, lifetimeBudget: p.request.budget.kind === "lifetime" ? p.request.budget.amount : undefined, startAt: p.request.startAt, endAt: p.request.endAt, managerUrl: p.managerUrl });
    out.adSets.push({ remoteId: p.adSetRemoteId, campaignRemoteId: p.campaignRemoteId, name: `${p.request.name} – Audience`, status: st, targetingSummary: p.request.audience?.countries?.join(", ") || "Automatic" });
    out.ads.push({ remoteId: p.adRemoteId, adSetRemoteId: p.adSetRemoteId, campaignRemoteId: p.campaignRemoteId, name: `${p.request.name} – Boosted post`, status: st, promotedPostRemoteId: p.request.sourcePostRemoteId });
  }
  return out;
}

export async function listAdAccounts(): Promise<AdAccountDescriptor[]> {
  return MOCK_AD_ACCOUNTS.map((a) => ({ ...a }));
}

export async function fetchPaidObjects(account: AdAccountDescriptor): Promise<PaidObjects> {
  const a = seededObjects(account);
  const b = promotedObjects(account);
  return { campaigns: [...a.campaigns, ...b.campaigns], adSets: [...a.adSets, ...b.adSets], ads: [...a.ads, ...b.ads] };
}

const METRICS: { metric: PaidMetric; base: number; spread: number; source: string }[] = [
  { metric: "spend", base: 95, spread: 40, source: "mock.spend" },
  { metric: "impressions", base: 18_000, spread: 7000, source: "mock.impressions" },
  { metric: "reach", base: 11_000, spread: 4000, source: "mock.reach" },
  { metric: "link_clicks", base: 380, spread: 160, source: "mock.inline_link_clicks" },
  { metric: "conversions", base: 14, spread: 9, source: "mock.actions.purchase" },
  { metric: "engagement", base: 620, spread: 300, source: "mock.post_engagement" },
];

function* days(since: string, until: string) {
  const d = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (d <= end) { yield d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + 1); }
}

function factsFor(entity: PaidInsightFact["entity"], remoteId: string, scale: number, day: string, currency: string, out: PaidInsightFact[]) {
  for (const m of METRICS) {
    const u = unit(`${remoteId}:${m.metric}:${day}`);
    const raw = (m.base + (u - 0.5) * 2 * m.spread) * scale;
    out.push({ entity, remoteId, metric: m.metric, day, value: Math.max(0, m.metric === "spend" ? Math.round(raw * 100) / 100 : Math.round(raw)), currency, source: m.source });
  }
}

/** Daily facts per campaign (and per ad when asked); a paused campaign reports nothing after being paused. */
export async function fetchPaidInsights(account: AdAccountDescriptor, req: PaidInsightsRequest): Promise<PaidInsightsPage> {
  const objects = await fetchPaidObjects(account);
  const levels = req.levels ?? ["campaign"];
  const facts: PaidInsightFact[] = [];
  for (const day of days(req.since, req.until)) {
    for (const c of objects.campaigns) {
      if (c.startAt && day < c.startAt.slice(0, 10)) continue;
      const scale = (c.dailyBudget ?? c.lifetimeBudget ?? 50) / 100;
      if (levels.includes("campaign")) factsFor("campaign", c.remoteId, scale, day, account.currency, facts);
      if (levels.includes("ad")) for (const ad of objects.ads.filter((a) => a.campaignRemoteId === c.remoteId)) factsFor("ad", ad.remoteId, scale, day, account.currency, facts);
    }
  }
  return { facts, currency: account.currency, timezone: account.timezone, attribution: { model: "provider (last click)", window: "7-day click, 1-day view" } };
}

export async function promote(account: AdAccountDescriptor, req: PromotionRequest): Promise<PromotionResult> {
  const existing = [...store().promotions.values()].find((p) => p.idempotencyKey === req.idempotencyKey);
  if (existing) return existing;
  if (store().behaviour.failPromote) throw new ProviderError("The ad account declined this promotion (policy).", { category: "policy", providerCode: "mock_policy" });
  if (req.budget.amount <= 0) throw new ProviderError("Budget must be greater than zero.", { category: "validation" });
  const id = `${account.remoteId}_p_${req.idempotencyKey.slice(0, 8)}`;
  const result: Promo = { accountId: account.remoteId, idempotencyKey: req.idempotencyKey, request: req, campaignRemoteId: id, adSetRemoteId: `${id}_s1`, adRemoteId: `${id}_a1`, status: req.initialStatus, managerUrl: `${account.managerUrl}/${id}`, createdAt: new Date().toISOString() };
  store().promotions.set(id, result);
  if (store().behaviour.ambiguousPromote) throw new ProviderError("Provider request timed out", { category: "temporary", ambiguous: true });
  return result;
}

export async function findPromotion(idempotencyKey: string): Promise<PromotionResult | null> {
  const p = [...store().promotions.values()].find((x) => x.idempotencyKey === idempotencyKey);
  return p ? { campaignRemoteId: p.campaignRemoteId, adSetRemoteId: p.adSetRemoteId, adRemoteId: p.adRemoteId, status: p.status, managerUrl: p.managerUrl, createdAt: p.createdAt } : null;
}

export async function setPaidObjectStatus(remoteId: string, status: "active" | "paused") {
  store().statuses.set(remoteId, status);
}

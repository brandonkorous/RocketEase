/*
 * GA4 conversion source — Google Analytics Data API v1beta.
 *
 *   properties/{id}:runReport  dimensions date, sessionSource, sessionMedium,
 *                              sessionCampaignName
 *                              metrics sessions, keyEvents, totalRevenue
 *   analyticsadmin properties/{id}  → display name + reporting currency
 *
 * GA4 renamed "conversions" to "keyEvents" in 2024; properties on the older
 * schema reject keyEvents, so a validation error retries with the old name.
 * Attribution is GA4's own — we import what it reports and never re-model it.
 *
 * UNTESTED AGAINST A LIVE PROPERTY: no Google Analytics credentials exist yet.
 */
import { googleAuthorizeUrl, googleTokenCall, httpJson, mapGoogleError, ProviderError, type GoogleError } from "@make-it-social/providers";
import { cleanDimension, fromCompactDay, isSocialRow, meaningful, type ConversionRow } from "./normalize";

export const GA4_DATA = "https://analyticsdata.googleapis.com/v1beta";
export const GA4_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
export const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

export type Ga4Report = { dimensionHeaders?: { name?: string }[]; metricHeaders?: { name?: string }[]; rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };
export type Ga4Property = { name?: string; displayName?: string; currencyCode?: string; timeZone?: string };

const num = (v: string | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

async function ga<T>(url: string, token: string, body?: unknown): Promise<T> {
  const res = await httpJson<T & GoogleError>(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: 30_000,
  });
  if (res.status >= 400) throw mapGoogleError(res.status, res.body as GoogleError, { headers: res.headers });
  return res.body;
}

/** GA4 metric name → our conversion metric. */
const METRIC_MAP: Record<string, ConversionRow["metric"]> = { sessions: "sessions", keyEvents: "conversions", conversions: "conversions", totalRevenue: "revenue" };

/** Turn a runReport grid into rows, keeping only socially attributable UTM combinations. */
export function reportToRows(report: Ga4Report, currency: string | undefined): ConversionRow[] {
  const dims = (report.dimensionHeaders ?? []).map((d) => d.name ?? "");
  const mets = (report.metricHeaders ?? []).map((m) => m.name ?? "");
  const at = (name: string) => dims.indexOf(name);
  const [dateAt, sourceAt, mediumAt, campaignAt] = [at("date"), at("sessionSource"), at("sessionMedium"), at("sessionCampaignName")];
  const out: ConversionRow[] = [];
  for (const row of report.rows ?? []) {
    const dv = row.dimensionValues ?? [];
    const dimension = cleanDimension({ utm_source: dv[sourceAt]?.value, utm_medium: dv[mediumAt]?.value, utm_campaign: dv[campaignAt]?.value });
    if (!isSocialRow(dimension)) continue;
    const day = fromCompactDay(String(dv[dateAt]?.value ?? ""));
    for (let i = 0; i < mets.length; i++) {
      const metric = METRIC_MAP[mets[i]];
      if (!metric) continue;
      out.push({ day, metric, value: num(row.metricValues?.[i]?.value), currency: metric === "revenue" ? currency : undefined, dimension, source: `ga4.${mets[i]}` });
    }
  }
  return meaningful(out);
}

const reportBody = (since: string, until: string, conversionMetric: string) => ({
  dateRanges: [{ startDate: since, endDate: until }],
  dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
  metrics: [{ name: "sessions" }, { name: conversionMetric }, { name: "totalRevenue" }],
  limit: 100_000,
  keepEmptyRows: false,
});

/** Property display name + reporting currency. Revenue is imported in this currency and never converted. */
export async function fetchGa4Property(token: string, propertyId: string): Promise<{ displayName: string; currency?: string }> {
  const p = await ga<Ga4Property>(`${GA4_ADMIN}/properties/${encodeURIComponent(propertyId)}`, token);
  return { displayName: p.displayName || `GA4 property ${propertyId}`, currency: p.currencyCode };
}

/** Daily sessions / key events / revenue by UTM for one property, filtered to social sources. */
export async function fetchGa4Conversions(token: string, propertyId: string, range: { since: string; until: string }, currency?: string): Promise<ConversionRow[]> {
  const url = `${GA4_DATA}/properties/${encodeURIComponent(propertyId)}:runReport`;
  try {
    return reportToRows(await ga<Ga4Report>(url, token, reportBody(range.since, range.until, "keyEvents")), currency);
  } catch (err) {
    if (!(err instanceof ProviderError) || err.category !== "validation") throw err;
    // Pre-2024 properties still expose the metric as `conversions`.
    return reportToRows(await ga<Ga4Report>(url, token, reportBody(range.since, range.until, "conversions")), currency);
  }
}

export type Ga4Credential = { accessToken: string; refreshToken?: string; expiresAt?: string; scopes: string[] };

export const ga4AuthorizeUrl = (clientId: string, redirectUri: string, state: string) => googleAuthorizeUrl({ clientId, redirectUri, state, scopes: GA4_SCOPES });

const expiry = (s?: number, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);

export async function exchangeGa4Code(cfg: { clientId: string; clientSecret: string }, code: string, redirectUri: string): Promise<Ga4Credential> {
  const t = await googleTokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  return { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes: (t.scope ?? "").split(" ").filter(Boolean) };
}

/** Google refresh tokens do not rotate; the response carries no new one. */
export async function refreshGa4Token(cfg: { clientId: string; clientSecret: string }, cred: Ga4Credential): Promise<Ga4Credential> {
  if (!cred.refreshToken) throw new ProviderError("Google Analytics access expired; reconnect the source.", { category: "permission", providerCode: "no_refresh_token" });
  const t = await googleTokenCall({ grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  return { ...cred, accessToken: t.access_token!, expiresAt: expiry(t.expires_in, cred.expiresAt), scopes: t.scope ? t.scope.split(" ").filter(Boolean) : cred.scopes };
}

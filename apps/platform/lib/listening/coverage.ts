/*
 * What each network lets a third-party app search (M14.11), with the document
 * behind every "yes" and the reason behind every "no". These are the words the
 * Listening screen shows, so the product never implies coverage it does not
 * have. Checked on 2026-09-06. Pure: safe in client components.
 */
export const LISTENING_NETWORKS = ["bluesky", "threads", "youtube"] as const;
export type ListeningNetwork = (typeof LISTENING_NETWORKS)[number];

export type Coverage = { label: string; covered: boolean; how: string; doc?: string };

export const LISTENING_COVERAGE: Record<ListeningNetwork | "x" | "reddit" | "instagram" | "facebook" | "others", Coverage> = {
  // app.bsky.feed.searchPosts on the public AppView: q, sort latest, since, limit 1–100 (25 default), cursor.
  bluesky: { label: "Bluesky", covered: true, how: "Post search as the connected Bluesky account, newest first, 25 a page. The public API refuses search without a signed-in session, checked 2026-09-06.", doc: "https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json" },
  // graph.threads.net/v1.0/keyword_search: permission threads_keyword_search; 2,200 queries a rolling 24 h per user; sensitive keywords answer empty.
  threads: { label: "Threads", covered: true, how: "Keyword search of public posts through your connected Threads profile; 2,200 searches a day per profile. Terms Threads deems sensitive return nothing.", doc: "https://developers.facebook.com/docs/threads/keyword-search" },
  // search.list: 1 unit in the Search Queries quota bucket; q, type video, order date, publishedAfter, maxResults 0–50.
  youtube: { label: "YouTube", covered: true, how: "Video titles and descriptions through your connected channel; comments are not searched.", doc: "https://developers.google.com/youtube/v3/docs/search/list" },
  // GET /2/tweets/search/recent: last 7 days, up to 100 a request, available to all tiers — but reads are billed per read on the current plans.
  x: { label: "X", covered: false, how: "Recent search reaches 7 days, but every read is billed per read. Off until a plan is chosen.", doc: "https://docs.x.com/x-api/posts/search/introduction" },
  // Responsible Builder Policy (June 2026): access needs approval; commercial use of the data needs Reddit's written approval.
  reddit: { label: "Reddit", covered: false, how: "Commercial use of Reddit's data API needs Reddit's written approval. Not requested." },
  instagram: { label: "Instagram", covered: false, how: "Only hashtag search exists (30 hashtags a week per account), not keywords. A later step." },
  facebook: { label: "Facebook", covered: false, how: "No public keyword search in the Graph API." },
  others: { label: "TikTok, LinkedIn, Pinterest", covered: false, how: "No keyword search for third-party apps." },
};

export type AdSource = "meta" | "tiktok";
export const AD_SOURCES: Record<AdSource, Coverage> = {
  // GET /ads_archive: ad_reached_countries, search_terms or search_page_ids, ad_type ALL; EU ads under the DSA, political/issue ads elsewhere; error 613 = rate limit.
  meta: { label: "Meta Ad Library", covered: true, how: "Every ad that reached an EU country in the last year, and political or issue ads worldwide for seven years. Read with the connected Facebook account's token; Meta issues one only to a person who has confirmed their identity with Meta.", doc: "https://developers.facebook.com/docs/graph-api/reference/ads_archive/" },
  // POST /v2/research/adlib/ad/query/: scope research.adlib.basic after application approval; EU countries only; kept a year after last shown.
  tiktok: { label: "TikTok Commercial Content Library", covered: true, how: "Ads shown in EU countries, kept a year after they last ran. Needs TikTok's approval of RocketEase's application.", doc: "https://developers.tiktok.com/doc/commercial-content-api-query-ads/" },
};

/** EU member states, the countries both repositories cover in full; Meta adds the rest of the world for political ads only. */
export const EU_COUNTRIES: { code: string; name: string }[] = [
  { code: "AT", name: "Austria" }, { code: "BE", name: "Belgium" }, { code: "BG", name: "Bulgaria" }, { code: "HR", name: "Croatia" }, { code: "CY", name: "Cyprus" }, { code: "CZ", name: "Czechia" }, { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" }, { code: "FI", name: "Finland" }, { code: "FR", name: "France" }, { code: "DE", name: "Germany" }, { code: "GR", name: "Greece" }, { code: "HU", name: "Hungary" }, { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" }, { code: "LV", name: "Latvia" }, { code: "LT", name: "Lithuania" }, { code: "LU", name: "Luxembourg" }, { code: "MT", name: "Malta" }, { code: "NL", name: "Netherlands" }, { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" }, { code: "RO", name: "Romania" }, { code: "SK", name: "Slovakia" }, { code: "SI", name: "Slovenia" }, { code: "ES", name: "Spain" }, { code: "SE", name: "Sweden" },
];

/** How often a query is checked; also how far back a first check reaches (seven days) — the screen says both. */
export const CHECK_EVERY_MS = 30 * 60_000;
export const FIRST_CHECK_DAYS = 7;
export const PAGE_SIZE = 20;

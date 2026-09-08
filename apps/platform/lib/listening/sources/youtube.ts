/*
 * YouTube search: search.list with the connected channel's token. Reference
 * (2026-09-06): part=snippet required; q; type video; order date;
 * publishedAfter RFC 3339; maxResults 0–50 (default 5); "a quota cost of 1
 * unit in the Search Queries quota bucket". Titles and descriptions only.
 */
import { httpJson, mapGoogleError, type GoogleError } from "@rocketease/providers";
import type { ListeningItem, SearchInput, SearchPage } from "../types";

export const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";

export type YtSearchItem = { id?: { videoId?: string }; snippet?: { publishedAt?: string; channelId?: string; channelTitle?: string; title?: string; description?: string } };
type Res = { items?: YtSearchItem[]; nextPageToken?: string } & GoogleError;

export function ytToItem(v: YtSearchItem): ListeningItem | null {
  const id = v.id?.videoId;
  if (!id) return null;
  const s = v.snippet ?? {};
  const text = [s.title, s.description].filter(Boolean).join(" — ");
  return { network: "youtube", remoteId: id, author: { name: s.channelTitle ?? "YouTube channel", url: s.channelId ? `https://www.youtube.com/channel/${s.channelId}` : undefined }, text, url: `https://www.youtube.com/watch?v=${id}`, occurredAt: s.publishedAt ?? new Date().toISOString() };
}

export async function searchYouTube(token: string, input: SearchInput, cursor?: string): Promise<SearchPage> {
  const u = new URL(YT_SEARCH);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("q", input.term);
  u.searchParams.set("type", "video");
  u.searchParams.set("order", "date");
  u.searchParams.set("publishedAfter", input.since.toISOString());
  u.searchParams.set("maxResults", String(Math.min(50, Math.max(1, input.limit))));
  if (cursor) u.searchParams.set("pageToken", cursor);
  const res = await httpJson<Res>(u.toString(), { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 20_000 });
  if (res.status >= 400) throw mapGoogleError(res.status, res.body, { headers: res.headers });
  return { items: (res.body?.items ?? []).map(ytToItem).filter((i): i is ListeningItem => Boolean(i)), cursor: res.body?.nextPageToken };
}

/*
 * Threads keyword search: GET graph.threads.net/v1.0/keyword_search with the
 * connected profile's token (permission threads_keyword_search). Reference
 * (2026-09-06): q, search_type TOP|RECENT, search_mode KEYWORD|TAG, fields,
 * since/until (unix), limit ≤ 100; 2,200 queries per rolling 24 h per user;
 * keywords Threads deems sensitive answer an empty array.
 */
import { httpJson, ProviderError, categoryFromStatus } from "@rocketease/providers";
import type { ListeningItem, SearchInput, SearchPage } from "../types";

export const THREADS_API = "https://graph.threads.net/v1.0";
export const THREADS_SEARCH_SCOPE = "threads_keyword_search";

export type ThreadsPost = { id?: string; text?: string; permalink?: string; timestamp?: string; username?: string };
type Res = { data?: ThreadsPost[]; paging?: { cursors?: { after?: string } }; error?: { message?: string; code?: number } };

export function threadsToItem(p: ThreadsPost): ListeningItem | null {
  if (!p.id || !p.username) return null;
  return { network: "threads", remoteId: p.id, author: { name: p.username, handle: `@${p.username}`, url: `https://www.threads.net/@${p.username}` }, text: p.text ?? "", url: p.permalink ?? null, occurredAt: p.timestamp ?? new Date().toISOString() };
}

export async function searchThreads(token: string, input: SearchInput, cursor?: string): Promise<SearchPage> {
  const u = new URL(`${THREADS_API}/keyword_search`);
  u.searchParams.set("q", input.term.slice(0, 255));
  u.searchParams.set("search_type", "RECENT");
  u.searchParams.set("fields", "id,text,permalink,timestamp,username");
  u.searchParams.set("since", String(Math.floor(input.since.getTime() / 1000)));
  u.searchParams.set("limit", String(Math.min(100, Math.max(1, input.limit))));
  if (cursor) u.searchParams.set("after", cursor);
  u.searchParams.set("access_token", token);
  const res = await httpJson<Res>(u.toString(), { timeoutMs: 20_000 });
  if (res.status >= 400 || res.body?.error) throw new ProviderError(res.body?.error?.message ?? `Threads search answered ${res.status}`, { category: categoryFromStatus(res.status), providerCode: res.body?.error?.code ? String(res.body.error.code) : undefined });
  return { items: (res.body?.data ?? []).map(threadsToItem).filter((i): i is ListeningItem => Boolean(i)), cursor: res.body?.paging?.cursors?.after };
}

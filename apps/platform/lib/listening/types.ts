import type { ListeningAuthor } from "@/db/schema/listening";
import type { ListeningNetwork } from "./coverage";

/** One public post a search returned, normalised across networks. */
export type ListeningItem = { network: ListeningNetwork; remoteId: string; author: ListeningAuthor; text: string; url: string | null; occurredAt: string };
export type SearchPage = { items: ListeningItem[]; cursor?: string };
export type SearchInput = { term: string; since: Date; limit: number };

/** One ad from a public repository, as the source reports it — dates and reach are theirs, never estimated. */
export type AdItem = { source: "meta" | "tiktok"; id: string; advertiser: string; text: string | null; title: string | null; snapshotUrl: string | null; firstShown: string | null; lastShown: string | null; platforms: string[]; reach: number | null; reachLabel: string | null };
export type AdPage = { items: AdItem[]; cursor?: string };
export type AdSearch = { term: string; country: string; days: number; cursor?: string };

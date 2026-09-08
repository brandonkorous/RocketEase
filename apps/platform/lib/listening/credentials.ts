/*
 * Which connected account a listening search runs as. Bluesky, Threads and
 * YouTube search through a connected account's token (Bluesky's public AppView
 * refuses search without a session), and Meta's Ad Library through a connected
 * Facebook Page's user token. The reason a
 * network cannot be searched here is a sentence the screen shows. Worker-safe.
 */
import type { Network } from "@rocketease/providers";
import { db } from "@/db";
import { loadCredential } from "@/lib/providers";
import { THREADS_SEARCH_SCOPE } from "./sources/threads";

export type SearchAs = { ok: true; token: string; as: string } | { ok: false; why: string };

const CONNECT: Record<string, string> = {
  bluesky: "Connect a Bluesky account in Connected accounts to search Bluesky; its public API refuses search without a signed-in session.",
  threads: "Connect a Threads profile in Connected accounts to search Threads.",
  youtube: "Connect a YouTube channel in Connected accounts to search YouTube.",
  facebook: "Connect a Facebook Page in Connected accounts; Meta's Ad Library is read with that login.",
};

/** The first healthy channel of this network in the workspace, with its connection. */
async function connectedChannel(workspaceId: string, network: Network) {
  const ch = await db.query.channel.findFirst({ where: (c, { and, eq, inArray }) => and(eq(c.workspaceId, workspaceId), eq(c.network, network), inArray(c.status, ["healthy", "degraded"])) });
  const conn = ch && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) }));
  return ch && conn ? { ch, conn } : null;
}

export async function searchAs(workspaceId: string, network: "bluesky" | "threads" | "youtube" | "facebook"): Promise<SearchAs> {
  const found = await connectedChannel(workspaceId, network);
  if (!found) return { ok: false, why: CONNECT[network] };
  if (network === "threads" && !found.conn.scopes.includes(THREADS_SEARCH_SCOPE)) return { ok: false, why: `Reconnect ${found.ch.name} in Connected accounts to grant keyword search (the ${THREADS_SEARCH_SCOPE} permission).` };
  try {
    const cred = await loadCredential(found.conn);
    return { ok: true, token: cred.accessToken, as: found.ch.handle ? `${found.ch.name} (${found.ch.handle})` : found.ch.name };
  } catch (e) {
    return { ok: false, why: `${found.ch.name} needs to be reconnected: ${e instanceof Error ? e.message : "its token could not be read"}.` };
  }
}

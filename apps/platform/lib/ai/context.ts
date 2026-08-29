/*
 * Server-side inputs for a draft: the workspace's brand voice, the real
 * capabilities of the channels a draft is aimed at, and the conversation a
 * reply belongs to. Read-only — drafting never writes.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { channel } from "@/db/schema/connections";
import { conversationDetail } from "@/lib/engagement/detail";
import { readBrandVoice, type BrandVoice } from "./brand-voice";
import type { DraftChannel, ReplyInput } from "./drafts";

const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", x: "X (Twitter)", youtube: "YouTube", pinterest: "Pinterest", google_business: "Google Business Profile", mock: "Demo network" };

export async function loadBrandVoice(workspaceId: string): Promise<BrandVoice> {
  const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
  return readBrandVoice(ws?.settings ?? {});
}

/**
 * Targets are always real connected channels: a draft is shaped by the limits
 * the provider actually reported, never by an assumed network default.
 */
export async function loadDraftChannels(workspaceId: string, channelIds: string[]): Promise<DraftChannel[]> {
  const ids = [...new Set(channelIds.filter(Boolean))];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: channel.id, name: channel.name, network: channel.network, capabilities: channel.capabilities })
    .from(channel)
    .where(and(eq(channel.workspaceId, workspaceId), inArray(channel.id, ids)));
  return rows.map((r) => ({
    channelId: r.id,
    network: r.network,
    networkLabel: NETWORK_LABEL[r.network] ?? r.network,
    channelName: r.name,
    textMax: r.capabilities.limits.textMaxChars,
    hashtagsMax: r.capabilities.limits.hashtagsMax,
    capabilities: r.capabilities,
  }));
}

/** The last turns of a conversation, plus the workspace's approved saved replies. */
export async function loadReplyContext(workspaceId: string, conversationId: string, timezone: string, voice: BrandVoice): Promise<ReplyInput | null> {
  const d = await conversationDetail(workspaceId, conversationId, timezone);
  if (!d) return null;
  const turns = d.messages
    .filter((m) => m.body.trim().length > 0)
    .slice(-12)
    .map((m) => ({ who: (m.direction === "inbound" ? "customer" : "us") as "customer" | "us", text: m.body.trim() }));
  if (!turns.length) return null;
  return {
    voice,
    networkLabel: NETWORK_LABEL[d.channel.network] ?? d.channel.network,
    contactName: d.contact.name,
    turns,
    savedReplies: d.savedReplies.map((r) => ({ title: r.title, body: r.body })),
    textMax: d.textMax,
  };
}

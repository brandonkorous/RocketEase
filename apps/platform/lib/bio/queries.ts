/*
 * Reads for the editor (Brand › Link in bio) and for the public page. The
 * avatar comes from the brand kit's logo files (favicon, else mark, else
 * primary), never from a network.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bioLink, bioPage, type BioPage } from "@/db/schema/bio";
import { channel } from "@/db/schema/connections";
import { loadBrandKit } from "@/lib/brand/load";
import type { BrandKit } from "@/lib/brand/types";
import { presignGet } from "@/lib/storage";
import { clickCounts, type ClickCounts } from "./clicks";
import { latestPosts, type BioPost } from "./posts";
import { BIO_LIMITS, brandPrimary, buttonColors, isPublicLink } from "./rules";

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";
export const publicAddress = (slug: string) => `${appUrl()}/l/${slug}`;

const AVATAR_ROLES = ["favicon", "mark", "primary"] as const;

async function avatarUrl(kit: BrandKit): Promise<string | null> {
  for (const role of AVATAR_ROLES) {
    const logo = kit.visual.logos.find((l) => l.role === role);
    if (logo) return presignGet(logo.key, 3600).catch(() => null);
  }
  return null;
}

export type PublicPageData = {
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  button: { background: string; text: string };
  links: { id: string; title: string }[];
  posts: BioPost[];
  postsNetwork: string | null;
};

/** The live page by address, or null — a page that is off or missing is one 404, never a hint that it exists. */
export async function loadPublicPage(slug: string): Promise<PublicPageData | null> {
  const page = await db.query.bioPage.findFirst({ where: and(eq(bioPage.slug, slug), eq(bioPage.live, true)) });
  if (!page) return null;
  const [kit, rows, ch] = await Promise.all([
    loadBrandKit(page.workspaceId),
    db.select().from(bioLink).where(eq(bioLink.pageId, page.id)).orderBy(asc(bioLink.position), asc(bioLink.createdAt)),
    page.postsChannelId ? db.query.channel.findFirst({ where: eq(channel.id, page.postsChannelId) }) : Promise.resolve(undefined),
  ]);
  const posts = page.showPosts && ch ? await latestPosts(ch.id, BIO_LIMITS.posts) : [];
  return {
    slug: page.slug,
    name: page.name,
    bio: page.bio,
    avatarUrl: page.avatar === "logo" ? await avatarUrl(kit) : null,
    button: buttonColors(page.buttonStyle, kit.visual.palette),
    links: rows.filter(isPublicLink).map((l) => ({ id: l.id, title: l.title })),
    posts,
    postsNetwork: posts.length && ch ? ch.network : null,
  };
}

export type EditorLink = { id: string; title: string; url: string; enabled: boolean; clicks: ClickCounts };
export type EditorChannel = { id: string; name: string; network: string; handle: string | null };
export type EditorData = {
  workspaceId: string;
  canEdit: boolean;
  page: (BioPage & { address: string }) | null;
  links: EditorLink[];
  channels: EditorChannel[];
  /** The kit's logo file the avatar would use, if it has one. */
  avatarUrl: string | null;
  primary: { name: string; hex: string } | null;
  kitName: string;
  /** What the public page shows right now, for the phone preview. */
  preview: PublicPageData | null;
  limits: typeof BIO_LIMITS;
};

export async function loadBioEditor(input: { workspaceId: string; workspaceName: string; canEdit: boolean }): Promise<EditorData> {
  const { workspaceId } = input;
  const [page, kit, channels] = await Promise.all([
    db.query.bioPage.findFirst({ where: eq(bioPage.workspaceId, workspaceId) }),
    loadBrandKit(workspaceId),
    db.select({ id: channel.id, name: channel.name, network: channel.network, handle: channel.handle }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))).orderBy(asc(channel.name)),
  ]);
  const primary = brandPrimary(kit.visual.palette);
  const logo = await avatarUrl(kit);
  const base = { workspaceId, canEdit: input.canEdit, channels, avatarUrl: logo, primary: primary ? { name: primary.name || "Primary", hex: primary.hex } : null, kitName: kit.identity.displayName || input.workspaceName, limits: BIO_LIMITS };
  if (!page) return { ...base, page: null, links: [], preview: null };
  const [rows, counts, ch] = await Promise.all([
    db.select().from(bioLink).where(eq(bioLink.pageId, page.id)).orderBy(asc(bioLink.position), asc(bioLink.createdAt)),
    clickCounts(page.id),
    page.postsChannelId ? db.query.channel.findFirst({ where: eq(channel.id, page.postsChannelId) }) : Promise.resolve(undefined),
  ]);
  const posts = page.showPosts && ch ? await latestPosts(ch.id, BIO_LIMITS.posts) : [];
  const preview: PublicPageData = {
    slug: page.slug, name: page.name, bio: page.bio, avatarUrl: page.avatar === "logo" ? logo : null, button: buttonColors(page.buttonStyle, kit.visual.palette),
    links: rows.filter(isPublicLink).map((l) => ({ id: l.id, title: l.title })), posts, postsNetwork: posts.length && ch ? ch.network : null,
  };
  return { ...base, page: { ...page, address: publicAddress(page.slug) }, links: rows.map((l) => ({ id: l.id, title: l.title, url: l.url, enabled: l.enabled, clicks: counts.get(l.id) ?? { week: 0, all: 0 } })), preview };
}

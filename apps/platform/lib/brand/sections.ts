/*
 * Brand hub sections. Client-safe (no database, no server-only imports) so the
 * section nav and the health panel can both link by slug.
 */
import type { BrandSection } from "./schema";

export const BRAND_SECTIONS: { slug: BrandSection; label: string; blurb: string }[] = [
  { slug: "identity", label: "Identity", blurb: "Who the business is, where it operates, and the links a post can point at." },
  { slug: "voice", label: "Voice", blurb: "How the brand sounds, what it never says, and posts that already got it right." },
  { slug: "visual", label: "Visual identity", blurb: "Logos, palette, typography, and the photography direction generated imagery follows." },
  { slug: "messaging", label: "Messaging", blurb: "Approved claims, value propositions, live offers, and the questions customers ask." },
  { slug: "audiences", label: "Audiences", blurb: "Who each post is angled at, in their own words." },
  { slug: "rules", label: "Rules", blurb: "Disclaimers, claim limits, and what forces a post into approval." },
  { slug: "assets", label: "Assets", blurb: "Logos and library media kept as brand assets, plus media that lives elsewhere." },
  { slug: "channels", label: "Channel presence", blurb: "Handle, bio, and link-in-bio per network." },
];

export const brandPath = (workspaceId: string, slug?: BrandSection) => `/app/${workspaceId}/brand${slug ? `/${slug}` : ""}`;

export const sectionLabel = (slug: BrandSection) => BRAND_SECTIONS.find((s) => s.slug === slug)?.label ?? slug;

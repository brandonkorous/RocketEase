import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/content/legal";
import { SOLUTION_SLUGS } from "@/content/marketing/solutions";
import { SITE } from "@/lib/site";

const MARKETING = [
  "",
  "/features",
  "/integrations",
  "/pricing",
  "/solutions",
  "/changelog",
  "/roadmap",
  "/blog",
  "/guides",
  "/templates",
  "/help",
  "/developers",
  "/status",
  "/about",
  "/careers",
  "/partners",
  "/contact",
  "/demo",
  "/legal",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    ...MARKETING,
    ...SOLUTION_SLUGS.map((s) => `/solutions/${s}`),
    ...LEGAL_DOCS.map((d) => `/${d.slug}`),
  ];
  return paths.map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/pricing" || path === "/features" ? 0.8 : 0.5,
  }));
}

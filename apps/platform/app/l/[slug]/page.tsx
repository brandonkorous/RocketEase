import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicBioPage } from "@/components/bio/public-page";
import { loadPublicPage } from "@/lib/bio/queries";
import { rateLimit } from "@/lib/reports/rate-limit";

export const dynamic = "force-dynamic";

/** One read per request, shared by the metadata and the page. */
const load = cache(loadPublicPage);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Not found", robots: { index: false, follow: false } };
  // A live page is meant to be found; the root layout's noindex is for the product, not for this.
  return { title: page.name, description: page.bio || undefined, robots: { index: true, follow: true } };
}

/** The public link-in-bio page. Session-free; a hidden or unknown address is one 404. */
export default async function LinkInBioPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`bio:${ip}`, 120, 60_000).ok) return <main className="mx-auto max-w-100 px-6 py-12 text-sm text-secondary">Too many requests. Give it a minute and reload.</main>;
  const page = await load(slug);
  if (!page) notFound();
  return (
    <main className="min-h-dvh bg-base-100">
      <PublicBioPage page={page} hrefFor={(linkId) => `/l/${slug}/go/${linkId}`} />
    </main>
  );
}

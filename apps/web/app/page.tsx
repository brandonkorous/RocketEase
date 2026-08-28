import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import {
  Hero,
  TrustStrip,
  Workflow,
  ProductProof,
  ResultsBand,
  Testimonials,
  FinalCta,
} from "@/components/sections";

/* Canonical page order per docs/originals/landing.md §31. */
export default function LandingPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-content"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main">
        <Hero />
        <TrustStrip />
        <Workflow />
        <ProductProof />
        <ResultsBand />
        <Testimonials />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

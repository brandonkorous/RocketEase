import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

/** Wraps every public page below the landing page: skip link, nav, main, footer. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-content"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}

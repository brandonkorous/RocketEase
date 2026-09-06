import type { PublicPageData } from "@/lib/bio/queries";
import { PublicBioPage } from "./public-page";

/** The phone preview beside the editor: the saved page, exactly as /l/:slug renders it. */
export function BioPreview({ page }: { page: PublicPageData }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-2.5 xl:sticky xl:top-6 xl:w-80" aria-label="Preview">
      <span className="text-xs font-semibold text-secondary">Preview · as a phone shows it</span>
      <div className="rounded-3xl border border-base-300 bg-base-100 p-2.5">
        <div className="h-175 overflow-y-auto rounded-2xl border border-base-300">
          <PublicBioPage page={page} hrefFor={() => "#"} compact />
        </div>
      </div>
    </aside>
  );
}

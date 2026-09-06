import { NetMark } from "@/components/net-mark";
import type { PublicPageData } from "@/lib/bio/queries";

type Props = { page: PublicPageData; hrefFor: (linkId: string) => string; compact?: boolean };

/**
 * The public link-in-bio page, also the editor's phone preview. Black, white
 * and structure; the ONE colour is the brand's own button colour, which is
 * content, so it is an inline style and not a class.
 */
export function PublicBioPage({ page, hrefFor, compact = false }: Props) {
  const avatar = compact ? "h-16 w-16" : "h-20 w-20";
  return (
    <div className={`mx-auto flex w-full max-w-100 flex-col items-center gap-4 bg-base-100 text-base-content ${compact ? "px-5 py-7" : "px-6 py-10"}`}>
      {page.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={page.avatarUrl} alt="" className={`${avatar} rounded-full border border-base-300 object-cover`} />
      ) : (
        <span className={`${avatar} flex items-center justify-center rounded-full bg-base-content text-2xl font-bold text-base-100`} aria-hidden="true">{page.name.trim().charAt(0).toUpperCase() || "•"}</span>
      )}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className={`${compact ? "text-lg" : "text-xl"} font-bold tracking-tight`}>{page.name}</h1>
        {page.bio && <p className="max-w-75 text-sm leading-normal text-secondary">{page.bio}</p>}
      </div>
      {page.links.length > 0 && (
        <nav aria-label="Links" className="flex w-full flex-col gap-2.5">
          {page.links.map((l) => (
            <a key={l.id} href={hrefFor(l.id)} className={`flex items-center justify-center rounded-field px-4 text-center font-semibold ${compact ? "h-11 text-sm" : "h-13 text-base"}`} style={{ background: page.button.background, color: page.button.text }}>{l.title}</a>
          ))}
        </nav>
      )}
      {page.posts.length > 0 && (
        <section aria-label="Latest posts" className="flex w-full flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wide text-secondary">Latest posts</span>
            {page.postsNetwork && <span className="flex items-center gap-1 text-secondary"><NetMark network={page.postsNetwork} size={12} /></span>}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {page.posts.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square overflow-hidden rounded-md bg-base-200" aria-label={p.title}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}
      <a href="https://rocketease.com" className="mt-auto pt-6 text-xs text-secondary/70 hover:underline">Made with RocketEase</a>
    </div>
  );
}

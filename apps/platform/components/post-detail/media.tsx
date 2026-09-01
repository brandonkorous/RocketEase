"use client";

import { ExpandButton, PlayBadge, useMediaLightbox } from "../shared/media-lightbox";

/** A shared asset on a published post: a thumbnail to show, and the original to enlarge. */
export type PostThumb = { id: string; kind: string; url: string | null; fullUrl: string | null; alt: string; fileName: string };

const viewable = (t: PostThumb) => (t.kind === "image" || t.kind === "video") && Boolean(t.fullUrl);

export function PostMedia({ thumbs }: { thumbs: PostThumb[] }) {
  const media = thumbs.filter(viewable).map((t) => ({ id: t.id, kind: t.kind as "image" | "video", src: t.fullUrl, alt: t.alt, caption: t.fileName }));
  const slideOf = new Map(media.map((m, i) => [m.id, i]));
  const { open, lightbox } = useMediaLightbox(media);

  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {thumbs.map((t) => {
        const at = slideOf.get(t.id);
        return (
          <li key={t.id} className="relative h-20 w-20 overflow-hidden rounded-field border border-base-300 bg-base-200">
            {t.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.url} alt={t.alt} className="h-full w-full object-cover" />}
            {t.kind === "video" && <PlayBadge />}
            {at != null && <ExpandButton onClick={() => open(at)} label={`View ${t.fileName || "this file"} larger`} className="absolute right-1 top-1" />}
          </li>
        );
      })}
      {lightbox}
    </ul>
  );
}

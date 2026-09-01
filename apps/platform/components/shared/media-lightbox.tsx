"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type LightboxMedia = { id: string; kind: "image" | "video"; src: string | null; alt?: string | null; caption?: React.ReactNode };

type Props = { items: LightboxMedia[]; index: number | null; onIndexChange: (index: number | null) => void };

/**
 * Silica's `<Lightbox>` hard-codes an `<img>`, and half our media is video — so
 * this wears Silica's own `lightbox-*` chrome and picks the element per item.
 */
export function MediaLightbox({ items, index, onIndexChange }: Props) {
  const popup = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const open = index != null && index >= 0 && index < items.length;
  const item = open ? items[index] : undefined;

  useEffect(() => setMounted(true), []);
  const go = useCallback(
    (delta: number) => index != null && items.length > 0 && onIndexChange((index + delta + items.length) % items.length),
    [index, items.length, onIndexChange],
  );
  useViewerKeys(open, popup, go, useCallback(() => onIndexChange(null), [onIndexChange]));

  if (!mounted || !open || !item) return null;
  return createPortal(
    <>
      <div className="lightbox-backdrop" />
      <div
        ref={popup}
        role="dialog"
        aria-modal="true"
        aria-label={`Media viewer — ${index + 1} of ${items.length}`}
        tabIndex={-1}
        className="lightbox-popup"
        onClick={(e) => e.target === e.currentTarget && onIndexChange(null)}
      >
        <span className="lightbox-counter">{index + 1} / {items.length}</span>
        <button type="button" className="lightbox-close" aria-label="Close" onClick={() => onIndexChange(null)}>{Icon.close}</button>
        {items.length > 1 && <button type="button" className="lightbox-nav lightbox-nav-prev" aria-label="Previous" onClick={() => go(-1)}>{Icon.prev}</button>}
        <Slide item={item} />
        {items.length > 1 && <button type="button" className="lightbox-nav lightbox-nav-next" aria-label="Next" onClick={() => go(1)}>{Icon.next}</button>}
        {item.caption && <div className="lightbox-caption">{item.caption}</div>}
      </div>
    </>,
    document.body,
  );
}

function Slide({ item }: { item: LightboxMedia }) {
  if (!item.src) return <p className="lightbox-caption">This file has no preview yet.</p>;
  if (item.kind === "video") return <video key={item.id} src={item.src} controls autoPlay playsInline className="lightbox-image" />;
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img key={item.id} src={item.src} alt={item.alt ?? ""} className="lightbox-image" />;
}

/** Escape/arrow keys, scroll lock, and focus handoff for as long as it is open. */
function useViewerKeys(open: boolean, popup: React.RefObject<HTMLDivElement | null>, go: (d: number) => void, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    popup.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      restore?.focus?.();
    };
  }, [open, popup, go, close]);
}

/** Holds the open index so a thumbnail grid only has to render `lightbox` and call `open(i)`. */
export function useMediaLightbox(items: LightboxMedia[]) {
  const [index, setIndex] = useState<number | null>(null);
  return { open: setIndex, lightbox: <MediaLightbox items={items} index={index} onIndexChange={setIndex} /> };
}

const p = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Icon = {
  close: <svg viewBox="0 0 24 24" {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  prev: <svg viewBox="0 0 24 24" {...p}><path d="M15 5l-7 7 7 7" /></svg>,
  next: <svg viewBox="0 0 24 24" {...p}><path d="M9 5l7 7-7 7" /></svg>,
  expand: <svg viewBox="0 0 24 24" width="14" height="14" {...p}><path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7" /></svg>,
};

/** Marks a video thumbnail as playable, so "open larger" reads as "play". */
export function PlayBadge() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </span>
  );
}

/**
 * The corner affordance for tiles whose own click already means something else.
 * Render it as a SIBLING of the tile button — never inside one.
 */
export function ExpandButton({ onClick, label, className = "" }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 ${className}`}
    >
      {Icon.expand}
    </button>
  );
}

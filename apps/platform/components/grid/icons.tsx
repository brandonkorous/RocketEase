const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** Small stroke icons for tiles and the side panel; one style, so status reads as icon + label everywhere. */
export const GridIcon = {
  clock: <svg width="12" height="12" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  pencil: <svg width="12" height="12" {...p}><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="m13 7 4 4" /></svg>,
  shield: <svg width="12" height="12" {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  alert: <svg width="12" height="12" {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.5" /></svg>,
  reel: <svg width="14" height="14" {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 4l3 5M14 4l3 5" /><path d="m10.5 12 4 2.5-4 2.5v-5Z" /></svg>,
  plus: <svg width="20" height="20" {...p} strokeWidth={1.75}><path d="M12 5v14M5 12h14" /></svg>,
  close: <svg width="16" height="16" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  external: <svg width="12" height="12" {...p}><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>,
  image: <svg width="18" height="18" {...p} strokeWidth={1.5}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></svg>,
};

export type GridIconName = keyof typeof GridIcon;

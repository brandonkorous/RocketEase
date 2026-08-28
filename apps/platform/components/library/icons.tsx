const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const LibIcon = {
  grid: <svg width="16" height="16" viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  list: <svg width="16" height="16" viewBox="0 0 24 24" {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
  play: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>,
  img: <svg width="14" height="14" viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  sparkle: <svg width="14" height="14" viewBox="0 0 24 24" {...p}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>,
  upload: <svg width="16" height="16" viewBox="0 0 24 24" {...p} strokeWidth="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>,
  filter: <svg width="16" height="16" viewBox="0 0 24 24" {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>,
};

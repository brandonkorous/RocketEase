/**
 * Marks a post an evergreen recycle rule created. Icon and label always travel
 * together (design.md: status is never colour alone); on the dense grids the
 * label is screen-reader-only and the title carries it.
 */
export function RecycledChip({ compact }: { compact?: boolean }) {
  return (
    <span title="Recycled from an earlier post" className={`inline-flex shrink-0 items-center gap-1 ${compact ? "" : "rounded-field border border-base-300 px-1.5 py-0.5"} text-xs`}>
      <svg viewBox="0 0 16 16" width={compact ? 11 : 12} height={compact ? 11 : 12} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9" />
        <path d="M11.9 1.7v2.4H9.5M4.1 14.3v-2.4h2.4" />
      </svg>
      <span className={compact ? "sr-only" : ""}>Recycled</span>
    </span>
  );
}

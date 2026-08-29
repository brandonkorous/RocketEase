import { StepGlyph } from "../post-detail/receipt-icons";
import type { ReceiptChip } from "@/lib/publishing/receipt";

/**
 * Compact publish-receipt status. Icon + label always travel together; on the
 * dense week/month grids the label is screen-reader-only and the tooltip carries
 * the full receipt line.
 */
export function ReceiptChipView({ chip, compact }: { chip: ReceiptChip; compact?: boolean }) {
  return (
    <span title={chip.tooltip} className={`inline-flex shrink-0 items-center gap-1 ${compact ? "" : "rounded-field border border-base-300 px-1.5 py-0.5"} text-xs`}>
      <StepGlyph icon={chip.icon} tone={chip.tone} size={compact ? 11 : 12} />
      <span className={compact ? "sr-only" : ""}>{chip.label}</span>
    </span>
  );
}

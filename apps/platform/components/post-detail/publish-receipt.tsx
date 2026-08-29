import { NetMark } from "@/components/net-mark";
import type { PublishReceipt as Receipt, ReceiptStep } from "@/lib/publishing/receipt";
import { receiptChip } from "@/lib/publishing/receipt";
import { formatInZone } from "@/lib/time";
import { StepGlyph } from "./receipt-icons";

/** Delivery record for one destination: what we sent, what the network confirmed, what we did with an ambiguous answer. */
export function PublishReceipt({ receipt, tz }: { receipt: Receipt; tz: string }) {
  const chip = receiptChip(receipt);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <NetMark network={receipt.network} size={18} />
        <span className="font-semibold">{receipt.channelName}</span>
        <span className="inline-flex items-center gap-1.5 rounded-field border border-base-300 px-2 py-0.5 text-xs">
          <StepGlyph icon={chip.icon} tone={chip.tone} size={12} />
          <span>{receipt.headline}</span>
        </span>
        {receipt.attempts > 1 && <span className="text-xs text-secondary/70">{receipt.attempts} attempts</span>}
      </div>
      <p className="mt-1 text-sm text-secondary">{receipt.summary}</p>
      {receipt.steps.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2 border-l border-base-300 pl-4">
          {receipt.steps.map((s) => (
            <Step key={s.key} step={s} tz={tz} />
          ))}
        </ol>
      )}
      {receipt.remoteId && (
        <p className="mt-2 text-xs text-secondary/70">
          Network id <span className="font-mono">{receipt.remoteId}</span>
          {receipt.permalink && (
            <>
              {" · "}
              <a href={receipt.permalink} target="_blank" rel="noreferrer" className="text-info hover:underline">
                Open on {receipt.networkLabel} ↗
              </a>
            </>
          )}
        </p>
      )}
      {receipt.nextAction && <p className="mt-2 rounded-field bg-base-200 px-3 py-2 text-xs">{receipt.nextAction}</p>}
    </li>
  );
}

function Step({ step, tz }: { step: ReceiptStep; tz: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">
        <StepGlyph icon={step.icon} tone={step.tone} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{step.label}</span>
        {step.detail && <span className="block text-xs text-secondary" title={step.fullId ?? undefined}>{step.detail}</span>}
      </span>
      <time className="shrink-0 text-xs text-secondary/70">{step.at ? formatInZone(step.at, tz, { dateStyle: "short", timeStyle: "short" }) : "—"}</time>
    </li>
  );
}

/** The "Publish receipts" panel on post detail. */
export function PublishReceipts({ receipts, tz }: { receipts: Receipt[]; tz: string }) {
  const shown = receipts.filter((r) => r.steps.length > 0);
  if (shown.length === 0) return null;
  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="receipts-h">
      <h2 id="receipts-h" className="text-base font-semibold">Publish receipts</h2>
      <p className="mt-1 text-sm text-secondary">Every attempt, in order. When a network answers ambiguously we ask it what exists before retrying, so a retry never duplicates a post.</p>
      <ul className="mt-3 divide-y divide-base-300">
        {shown.map((r) => (
          <PublishReceipt key={r.variantId} receipt={r} tz={tz} />
        ))}
      </ul>
    </section>
  );
}

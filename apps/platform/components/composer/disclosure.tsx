"use client";

import { Input, Radio } from "@wizeworks/silicaui-react";
import { planDisclosure } from "@make-it-social/providers";
import { SYNTHETIC_CHOICES, previewLine } from "@/lib/disclosure";
import type { SyntheticFlag } from "@/db/schema/content";
import { NetMark } from "../library-screen";
import { NETWORK_LABEL, type ComposerChannel } from "./types";
import type { ComposerState } from "./use-composer";

type Props = { s: ComposerState; channels: ComposerChannel[] };

/** What one destination will actually do with the author's answer. */
function destinationPreview(c: ComposerChannel, flag: SyntheticFlag) {
  const plan = planDisclosure(c.disclosure, { synthetic: flag === "synthetic_media", assisted: flag !== "none" }, c.disclosureReason ?? undefined);
  return { plan, label: previewLine(NETWORK_LABEL[c.network] ?? c.network, plan.method) };
}

/**
 * AI disclosure (trends-2026.md §3). Networks differ: TikTok, YouTube and
 * Instagram take a real API field; everywhere else the label has to be copy.
 * The preview says which, per destination, before anything is scheduled.
 */
export function DisclosureSection({ s, channels }: Props) {
  const selected = channels.filter((c) => s.selected.includes(c.id));
  const synthetic = s.syntheticFlag === "synthetic_media";
  return (
    <section className="border-t border-base-300 px-5 py-4" aria-labelledby="ai-disclosure-h">
      <h3 id="ai-disclosure-h" className="text-sm font-semibold">Contains AI-generated media?</h3>
      <p className="mt-1 text-xs text-secondary/70">Realistic AI-generated images, video or audio must be labelled on most networks.</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {SYNTHETIC_CHOICES.map((c) => (
          <label key={c.flag} className="flex items-start gap-2.5 text-sm">
            <Radio name="synthetic" className="mt-0.5" checked={s.syntheticFlag === c.flag} onChange={() => s.setSyntheticFlag(c.flag)} />
            <span className="min-w-0"><span className="block">{c.label}</span><span className="block text-xs text-secondary/70">{c.desc}</span></span>
          </label>
        ))}
      </div>
      {synthetic && (
        <Input
          size="sm" className="mt-3 w-full" value={s.syntheticNote} maxLength={280} placeholder="What was generated? (optional, kept internally)"
          aria-label="AI disclosure note" onChange={(e) => s.setSyntheticNote(e.target.value)}
        />
      )}
      {synthetic && <DestinationPreview channels={selected} flag={s.syntheticFlag} />}
    </section>
  );
}

function DestinationPreview({ channels, flag }: { channels: ComposerChannel[]; flag: SyntheticFlag }) {
  if (channels.length === 0) return <p className="mt-3 text-xs text-secondary/70">Pick destinations to see how each one will be labelled.</p>;
  return (
    <ul className="mt-3 flex flex-col gap-1.5" aria-label="Disclosure per destination">
      {channels.map((c) => {
        const { plan, label } = destinationPreview(c, flag);
        return (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <NetMark network={c.network} size={14} />
            <span className={plan.method === "none" ? "text-error" : "text-secondary"}>
              {label}
              {plan.method === "none" && <span className="block">{plan.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

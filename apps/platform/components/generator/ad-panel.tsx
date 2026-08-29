"use client";

import { useState } from "react";
import { Badge, Button, Input, Textarea, useToast } from "@wizeworks/silicaui-react";
import { adSpecFor, validateAdCopy, type AdField, type AdSpec } from "@/lib/ai/generator/ad-specs";
import { AD_CTA_LABELS, type AdSet, type AdVariant } from "@/lib/ai/generator/types";
import { NetMark } from "../net-mark";
import { IssueList, LengthMeter } from "./meter";

const FIELDS: AdField[] = ["primaryText", "headline", "description"];

/**
 * Ad copy sits in its own section because it is money: a person reads the
 * field meters and the network's own limits before any of it is promoted.
 * Nothing here creates or funds an ad.
 */
export function AdPanel({ adSets }: { adSets: AdSet[] }) {
  if (!adSets.length) return null;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="ads-h">
      <div>
        <h2 id="ads-h" className="text-base font-semibold">Ad variants</h2>
        <p className="mt-1 text-sm text-secondary">Copy only. Promoting anything is a separate, explicit step with its own spend confirmation.</p>
      </div>
      {adSets.map((set) => {
        const spec = adSpecFor(set.network);
        if (!spec) return null;
        return <AdSetCard key={set.channelId} set={set} spec={spec} />;
      })}
    </section>
  );
}

function AdSetCard({ set, spec }: { set: AdSet; spec: AdSpec }) {
  return (
    <div className="rounded-box border border-base-300">
      <header className="flex flex-wrap items-center gap-2 border-b border-base-300 px-4 py-3">
        <NetMark network={set.network} size={18} />
        <span className="text-sm font-semibold">{set.networkLabel}</span>
        <span className="text-xs text-secondary/70">{spec.placement}</span>
        {!spec.verified && <Badge size="xs" variant="soft" color="warning">Limits unverified</Badge>}
      </header>
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        {set.variants.map((v) => (<AdVariantCard key={v.id} variant={v} spec={spec} />))}
      </div>
      {spec.sourceUrl && (
        <p className="border-t border-base-300 px-4 py-2 text-xs text-secondary/70">
          Field limits from <a href={spec.sourceUrl} target="_blank" rel="noreferrer" className="underline">{spec.networkLabel}&apos;s own ads guide</a>.
        </p>
      )}
    </div>
  );
}

function AdVariantCard({ variant, spec }: { variant: AdVariant; spec: AdSpec }) {
  const toast = useToast();
  const [copy, setCopy] = useState<Record<AdField, string>>({ primaryText: variant.primaryText, headline: variant.headline, description: variant.description });
  const issues = validateAdCopy(spec, copy);

  const copyAll = async () => {
    const text = FIELDS.filter((f) => !spec.fields[f].unavailable && copy[f]).map((f) => `${spec.fields[f].label}: ${copy[f]}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: "Ad copy copied.", type: "success" });
    } catch {
      toast.add({ title: "Your browser blocked the clipboard. Select the text and copy it.", type: "error", timeout: 7000 });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-field border border-base-300 p-3">
      {FIELDS.map((f) => {
        const field = spec.fields[f];
        if (field.unavailable) return <p key={f} className="text-xs text-secondary/70">{field.label}: {field.note}</p>;
        return (
          <label key={f} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-secondary">{field.label}</span>
            {f === "primaryText" ? (
              <Textarea rows={3} value={copy[f]} onChange={(e) => setCopy({ ...copy, [f]: e.target.value })} aria-label={field.label} />
            ) : (
              <Input value={copy[f]} onChange={(e) => setCopy({ ...copy, [f]: e.target.value })} aria-label={field.label} />
            )}
            <LengthMeter label={field.label} count={copy[f].length} limit={field.max ?? field.recommended} note={field.note} />
          </label>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <Badge size="xs" variant="soft" color="neutral">{AD_CTA_LABELS[variant.cta]}</Badge>
        <Button size="xs" variant="ghost" color="neutral" onClick={copyAll}>Copy</Button>
      </div>
      <IssueList issues={issues} />
    </div>
  );
}

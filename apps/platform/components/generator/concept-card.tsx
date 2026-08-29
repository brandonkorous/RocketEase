"use client";

import { Badge, Button, Input, Textarea } from "@wizeworks/silicaui-react";
import { estimatePublishCost, isFreeToPublish, type ChannelKind, type ProviderKey } from "@make-it-social/providers/client";
import { conceptText, type Concept } from "@/lib/ai/generator/types";
import { NetMark } from "../net-mark";
import { IssueList, LengthMeter } from "./meter";
import type { GeneratorChannel } from "./types";
import type { ConceptImage, GeneratorApi } from "./use-generator";

type Props = { api: GeneratorApi; concept: Concept; channel?: GeneratorChannel; imagesEnabled: boolean };

/**
 * One concept, editable in place. The card is a draft a person is expected to
 * rewrite — every field is an input, and nothing leaves the card until they
 * press "Use in Create".
 */
export function ConceptCard({ api, concept: c, channel, imagesEnabled }: Props) {
  const images = api.images[c.id] ?? [];
  const busy = api.busy === c.id;
  const text = conceptText(c);

  return (
    <article className="rounded-box border border-base-300">
      <header className="flex flex-wrap items-center gap-2 border-b border-base-300 px-4 py-3">
        <NetMark network={channel?.network ?? ""} size={18} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{channel?.name ?? "Channel"}</span>
        <Badge size="xs" variant="soft" color="neutral">{c.format}</Badge>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        {c.rationale && <p className="text-xs text-secondary">Why this angle: {c.rationale}</p>}

        <Labelled label="Hook">
          <Textarea rows={2} value={c.hook} onChange={(e) => api.edit(c.id, { hook: e.target.value })} aria-label="Hook" />
        </Labelled>
        <Labelled label="Body">
          <Textarea rows={5} value={c.body} onChange={(e) => api.edit(c.id, { body: e.target.value })} aria-label="Body" />
        </Labelled>
        <Labelled label="Call to action">
          <Input value={c.cta} onChange={(e) => api.edit(c.id, { cta: e.target.value })} aria-label="Call to action" />
        </Labelled>
        <Labelled label={`Hashtags${channel?.hashtagsMax ? ` (max ${channel.hashtagsMax})` : ""}`}>
          <Input value={c.hashtags.join(" ")} onChange={(e) => api.edit(c.id, { hashtags: e.target.value.split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean) })} aria-label="Hashtags" />
        </Labelled>
        {c.firstComment !== undefined && (
          <Labelled label="First comment">
            <Textarea rows={2} value={c.firstComment} onChange={(e) => api.edit(c.id, { firstComment: e.target.value })} aria-label="First comment" />
          </Labelled>
        )}
        {c.altText !== undefined && (
          <Labelled label="Alt text suggestion">
            <Input value={c.altText} onChange={(e) => api.edit(c.id, { altText: e.target.value })} aria-label="Alt text" />
          </Labelled>
        )}

        <LengthMeter label="Post length" count={text.length} limit={channel?.textMax ?? undefined} />
        <IssueList issues={c.validation} />
        <p className="text-xs text-secondary/70">Disclosure: {c.disclosure.detail}</p>
        {channel && <CostNote channel={channel} media={images.length} />}
        {images.length > 0 && <Images images={images} />}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-base-300 px-4 py-3">
        <Button size="sm" color="primary" disabled={busy} onClick={() => api.use(c)}>{busy ? "Creating…" : "Use in Create"}</Button>
        <Button size="sm" variant="outline" color="neutral" disabled={busy} onClick={() => api.regenerate(c)}>Regenerate</Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={() => api.copy(c)}>Copy</Button>
        {imagesEnabled && (
          <Button size="sm" variant="ghost" color="neutral" disabled={api.busy === `${c.id}:image`} onClick={() => api.makeImage(c)}>
            {api.busy === `${c.id}:image` ? "Generating image…" : "Generate image"}
          </Button>
        )}
      </footer>
    </article>
  );
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** What publishing this concept would cost on this channel. Silent when nothing is sourced. */
function CostNote({ channel, media }: { channel: GeneratorChannel; media: number }) {
  const cost = estimatePublishCost(channel.provider as ProviderKey, channel.kind as ChannelKind, { mediaCount: media });
  if (isFreeToPublish(cost)) return null;
  const bits = [
    cost.money ? `${MONEY.format(cost.money.amount)} per post` : null,
    cost.dailyCap ? `${cost.dailyCap.count} posts per ${cost.dailyCap.window}` : null,
    cost.quota ? `${cost.quota.units} of ${cost.quota.of} API units per ${cost.quota.window}` : null,
  ].filter(Boolean);
  return <p className="text-xs text-secondary/70">Publishing here: {bits.join(" · ")}.</p>;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-secondary">{label}</span>
      {children}
    </label>
  );
}

function Images({ images }: { images: ConceptImage[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-secondary">Generated images</span>
      <div className="flex flex-wrap gap-2">
        {images.map((img) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={img.assetId} src={img.url} alt="" className="size-20 rounded-field border border-base-300 object-cover" />
        ))}
      </div>
      <p className="text-xs text-secondary/70">AI-generated. The draft will be marked as synthetic media so the disclosure is applied.</p>
    </div>
  );
}

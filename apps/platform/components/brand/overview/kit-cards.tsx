import { OverviewCard, OverviewEmpty } from "@/components/overview-card";
import { brandPath } from "@/lib/brand/sections";
import type { BrandKit } from "@/lib/brand/types";
import { Chips, Meta, plural } from "./chip";

type Base = { workspaceId: string; kit: BrandKit };

const COMPETITOR: Record<string, string> = { never: "No competitor mentions", no_names: "Contrast, no names", allowed: "Competitors may be named" };

export function IdentityCard({ workspaceId, kit }: Base) {
  const i = kit.identity;
  const href = brandPath(workspaceId, "identity");
  const name = i.displayName || i.legalName;
  return (
    <OverviewCard title="Identity" href={href} linkLabel="Edit">
      {!name && !i.oneLiner ? (
        <OverviewEmpty title="Nothing recorded yet" body="Drafts start from the brief alone, so posts read like they could be about any business." cta="Add identity" href={href} />
      ) : (
        <div className="flex flex-col gap-2">
          {name && <p className="text-base font-semibold">{name}</p>}
          {i.oneLiner && <p className="text-sm leading-relaxed text-secondary">{i.oneLiner}</p>}
          {i.locations.length > 0 && <Chips items={i.locations.slice(0, 4)} />}
          <Meta parts={[i.category || null, i.website ? "Website set" : null, i.links.length ? plural(i.links.length, "link") : null]} />
        </div>
      )}
    </OverviewCard>
  );
}

/** Tone is free text; splitting on commas renders what the writer typed, nothing inferred. */
const toneWords = (tone: string) => tone.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);

export function VoiceCard({ workspaceId, kit }: Base) {
  const { voice, voiceRules } = kit;
  const href = brandPath(workspaceId, "voice");
  const words = toneWords(voice.tone);
  return (
    <OverviewCard title="Voice" href={href} linkLabel="Edit">
      {!voice.tone && !voice.audience && !voice.doList.length ? (
        <OverviewEmpty title="No voice set" body="Every draft comes back in generic marketing English until the brand has a tone." cta="Set the voice" href={href} />
      ) : (
        <div className="flex flex-col gap-3">
          {words.length > 0 && <Chips items={words} />}
          {voice.audience && <p className="text-sm text-secondary"><span className="text-secondary/70">Audience</span> · {voice.audience}</p>}
          <Meta parts={[
            voice.doList.length ? plural(voice.doList.length, "do") : null,
            voice.dontList.length ? plural(voice.dontList.length, "don't", "don'ts") : null,
            voice.examples.length ? plural(voice.examples.length, "example") : "no examples",
            voiceRules.bannedWords.length ? plural(voiceRules.bannedWords.length, "banned word") : null,
          ]} />
        </div>
      )}
    </OverviewCard>
  );
}

export function MessagingCard({ workspaceId, kit, today }: Base & { today: string }) {
  const m = kit.messaging;
  const href = brandPath(workspaceId, "messaging");
  const live = m.offers.filter((o) => !o.expiresAt || o.expiresAt >= today);
  const stale = m.offers.length - live.length;
  const empty = !m.boilerplate && !m.taglines.length && !m.valueProps.length;
  return (
    <OverviewCard title="Messaging" href={href} linkLabel="Edit">
      {empty ? (
        <OverviewEmpty title="No approved messaging" body="Every draft has to be told what is good about the product, in the brief, every time." cta="Add messaging" href={href} />
      ) : (
        <div className="flex flex-col gap-2">
          {m.taglines[0] && <p className="text-base font-semibold">{m.taglines[0]}</p>}
          {m.valueProps.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-secondary">
              {m.valueProps.slice(0, 3).map((v) => (<li key={v} className="truncate">{v}</li>))}
            </ul>
          )}
          <Meta parts={[
            m.valueProps.length ? plural(m.valueProps.length, "value prop") : null,
            m.proofPoints.length ? plural(m.proofPoints.length, "proof point") : null,
            live.length ? `${plural(live.length, "live offer")}` : null,
            stale ? `${stale} expired` : null,
          ]} />
        </div>
      )}
    </OverviewCard>
  );
}

export function AudiencesCard({ workspaceId, kit }: Base) {
  const href = brandPath(workspaceId, "audiences");
  return (
    <OverviewCard title="Audiences" href={href} linkLabel="Edit">
      {kit.audiences.length === 0 ? (
        <OverviewEmpty title="No audiences yet" body="Concepts cannot be angled at a specific reader, so they average out." cta="Add an audience" href={href} />
      ) : (
        <div className="flex flex-col gap-2">
          <Chips items={kit.audiences.map((a) => a.name)} />
          <Meta parts={[plural(kit.audiences.reduce((n, a) => n + a.pains.length, 0), "recorded pain")]} />
        </div>
      )}
    </OverviewCard>
  );
}

export function RulesCard({ workspaceId, kit }: Base) {
  const r = kit.rules;
  const href = brandPath(workspaceId, "rules");
  const empty = !r.disclaimers.length && !r.claimRules.length && !r.regulatedNote && !r.competitorPolicy;
  return (
    <OverviewCard title="Rules" href={href} linkLabel="Edit">
      {empty ? (
        <OverviewEmpty title="No rules set" body="Nothing stops a draft making a claim this brand is not allowed to make." cta="Add rules" href={href} />
      ) : (
        <div className="flex flex-col gap-2">
          {r.disclaimers[0] && <p className="text-sm leading-relaxed">“{r.disclaimers[0].text}”</p>}
          {r.competitorPolicy && <Chips items={[COMPETITOR[r.competitorPolicy]]} />}
          <Meta parts={[
            r.disclaimers.length ? plural(r.disclaimers.length, "disclaimer") : null,
            r.claimRules.length ? plural(r.claimRules.length, "claim rule") : null,
            r.regulatedNote ? "Regulatory note" : null,
          ]} />
        </div>
      )}
    </OverviewCard>
  );
}

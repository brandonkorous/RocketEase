/* Word sections of the brand kit document: cover, identity, voice, messaging, audiences, rules. */
import React from "react"; // classic JSX runtime, see render.tsx
import { COMPETITOR_RULE, EMOJI_RULE, SPELLING_RULE } from "../prompt";
import type { BrandDocument } from "./document";

type P = { doc: BrandDocument };

export const Empty = () => <p className="muted small">Not recorded yet.</p>;

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export const List = ({ items }: { items: string[] }) => (items.length ? <ul className="plain">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <Empty />);
export const Tags = ({ items }: { items: string[] }) => (items.length ? <p className="tags">{items.map((s, i) => <span key={i}>{s}</span>)}</p> : <Empty />);
const Text = ({ value }: { value: string }) => (value ? <p>{value}</p> : <Empty />);

export function Cover({ doc }: P) {
  const { identity } = doc.kit;
  const primary = doc.logos.find((l) => l.role === "primary" && l.dataUri) ?? doc.logos.find((l) => l.dataUri);
  const name = identity.displayName || doc.meta.workspaceName;
  return (
    <header className="cover">
      <div className="brandrow">
        <div>{doc.preparedBy.logo ? <img src={doc.preparedBy.logo} alt={doc.preparedBy.name} /> : <span className="brandname">{doc.preparedBy.name}</span>}</div>
        {primary?.dataUri && <div style={{ textAlign: "right" }}><img src={primary.dataUri} alt={name} style={{ marginLeft: "auto" }} /></div>}
      </div>
      <h1>{doc.meta.title}</h1>
      <p className="muted">{identity.oneLiner || `Brand kit for ${name}.`}</p>
      <dl className="metagrid">
        <div><dt>Category</dt><dd>{identity.category || "—"}</dd></div>
        <div><dt>Website</dt><dd>{identity.website || "—"}</dd></div>
        <div><dt>Locations</dt><dd>{identity.locations.join(", ") || "—"}</dd></div>
        <div><dt>Languages</dt><dd>{identity.languages.join(", ") || "—"}</dd></div>
      </dl>
    </header>
  );
}

export function IdentitySection({ doc }: P) {
  const { identity } = doc.kit;
  return (
    <Section title="Identity">
      <div className="two">
        <div><h3>Legal name</h3><Text value={identity.legalName} /></div>
        <div><h3>Display name</h3><Text value={identity.displayName} /></div>
      </div>
      <Sub title="Links">{identity.links.length ? <ul className="plain">{identity.links.map((l, i) => <li key={i}>{l.label ? `${l.label}: ` : ""}<a href={l.url}>{l.url}</a></li>)}</ul> : <Empty />}</Sub>
    </Section>
  );
}

export function VoiceSection({ doc }: P) {
  const { voice, voiceRules } = doc.kit;
  const rules = [voiceRules.emoji && EMOJI_RULE[voiceRules.emoji], voiceRules.spelling && SPELLING_RULE[voiceRules.spelling], voiceRules.readingLevel && `Reading level: ${voiceRules.readingLevel}`, voiceRules.ctaStyle && `Calls to action: ${voiceRules.ctaStyle}`].filter((s): s is string => Boolean(s));
  return (
    <Section title="Voice">
      <div className="two">
        <div><h3>Tone</h3><Text value={voice.tone} /></div>
        <div><h3>Audience</h3><Text value={voice.audience} /></div>
        <div><h3>Do</h3><List items={voice.doList} /></div>
        <div><h3>Don&rsquo;t</h3><List items={voice.dontList} /></div>
      </div>
      <Sub title="Writing rules"><List items={rules} /></Sub>
      <Sub title="Words never to use"><Tags items={voiceRules.bannedWords} />{voiceRules.bannedWords.length > 0 && <p className="small muted">A post containing one of these cannot be scheduled in RocketEase.</p>}</Sub>
      <Sub title="Posts that already sound right">{voice.examples.length ? voice.examples.map((e, i) => <p key={i} className="quote">{e}</p>) : <Empty />}</Sub>
    </Section>
  );
}

export function MessagingSection({ doc }: P) {
  const { messaging } = doc.kit;
  const today = doc.meta.today;
  return (
    <Section title="Messaging">
      <Sub title="Boilerplate"><Text value={messaging.boilerplate} /></Sub>
      <div className="two">
        <div><h3>Taglines</h3><List items={messaging.taglines} /></div>
        <div><h3>Value propositions</h3><List items={messaging.valueProps} /></div>
      </div>
      <Sub title="Proof points"><List items={messaging.proofPoints} /></Sub>
      <Sub title="Offers">
        {messaging.offers.length ? (
          <table><thead><tr><th>Offer</th><th>Detail</th><th>Until</th></tr></thead><tbody>
            {messaging.offers.map((o, i) => <tr key={i}><td>{o.name}</td><td>{o.detail}</td><td>{o.expiresAt ? `${o.expiresAt}${o.expiresAt < today ? " (expired)" : ""}` : "No end date"}</td></tr>)}
          </tbody></table>
        ) : <Empty />}
      </Sub>
      <Sub title="Questions customers ask">{messaging.faqs.length ? messaging.faqs.map((f, i) => <p key={i}><b>{f.question}</b><br />{f.answer}</p>) : <Empty />}</Sub>
    </Section>
  );
}

export function AudiencesSection({ doc }: P) {
  const { audiences } = doc.kit;
  return (
    <Section title="Audiences">
      {audiences.length ? audiences.map((a, i) => (
        <div key={i} className="card" style={{ marginTop: 12 }}>
          <h3>{a.name || `Audience ${i + 1}`}</h3>
          <Text value={a.description} />
          <div className="two">
            <div><span className="k small muted">What they struggle with</span><List items={a.pains} /></div>
            <div><span className="k small muted">Words they use</span><Tags items={a.words} /></div>
          </div>
          {a.channels.length > 0 && <p className="small muted">Reached on: {a.channels.join(", ")}</p>}
        </div>
      )) : <Empty />}
    </Section>
  );
}

export function RulesSection({ doc }: P) {
  const { rules } = doc.kit;
  return (
    <Section title="Rules">
      <Sub title="Required disclaimers">
        {rules.disclaimers.length ? <table><thead><tr><th>Text</th><th>Applies to</th></tr></thead><tbody>{rules.disclaimers.map((d, i) => <tr key={i}><td>{d.text}</td><td>{d.appliesTo || "Everything"}</td></tr>)}</tbody></table> : <Empty />}
      </Sub>
      <Sub title="Claims that are not allowed"><List items={rules.claimRules} />{rules.claimRules.length > 0 && <p className="small muted">Words in quotes are blocked in the composer; the rest is judged by the reviewer.</p>}</Sub>
      <div className="two">
        <div><h3>Competitors</h3><Text value={rules.competitorPolicy ? COMPETITOR_RULE[rules.competitorPolicy] ?? "" : ""} /></div>
        <div><h3>Regulatory context</h3><Text value={rules.regulatedNote} /></div>
      </div>
      <Sub title="Goes to approval when a post mentions"><List items={rules.approvalTriggers} /></Sub>
    </Section>
  );
}

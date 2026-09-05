/* Visual identity, channel presence and assets in the brand kit document. */
import React from "react"; // classic JSX runtime, see render.tsx
import { isHex } from "../read";
import { SWATCH_LABEL } from "../types";
import type { BrandDocument } from "./document";
import { Empty, List, Section, Sub } from "./sections";

type P = { doc: BrandDocument };

export function VisualSection({ doc }: P) {
  const { visual } = doc.kit;
  const shown = doc.logos.filter((l) => l.dataUri);
  return (
    <Section title="Visual identity">
      <Sub title="Logos">
        {shown.length ? (
          <div className="logos">
            {shown.map((l) => (
              <div key={l.role} className={l.role === "mono_dark" ? "logo dark" : "logo"}>
                <img src={l.dataUri!} alt={l.label} />
                <b>{l.label}</b>
                {l.note && <div>{l.note}</div>}
              </div>
            ))}
          </div>
        ) : <Empty />}
        {doc.logos.length > shown.length && <p className="small muted">{doc.logos.length - shown.length} logo file(s) could not be embedded (missing or over 512 KB).</p>}
      </Sub>
      <div className="two">
        <div><h3>Clear space</h3>{visual.clearSpace ? <p>{visual.clearSpace}</p> : <Empty />}</div>
        <div><h3>Minimum size</h3>{visual.minSize ? <p>{visual.minSize}</p> : <Empty />}</div>
      </div>
      <Sub title="Palette">
        {visual.palette.length ? (
          <div className="swatches">
            {visual.palette.map((s, i) => (
              <div key={i} className="swatch">
                <div className="chip" style={{ background: isHex(s.hex) ? s.hex : "#e5e5e5" }} />
                <div className="k"><b>{s.name || SWATCH_LABEL[s.role]}</b>{s.hex.toUpperCase()} · {SWATCH_LABEL[s.role]}{s.note ? ` · ${s.note}` : ""}</div>
              </div>
            ))}
          </div>
        ) : <Empty />}
      </Sub>
      <Sub title="Typography">
        <dl className="metagrid">
          <div><dt>Headings</dt><dd>{visual.typography.headingFamily || "—"}</dd></div>
          <div><dt>Body</dt><dd>{visual.typography.bodyFamily || "—"}</dd></div>
          <div><dt>Weights</dt><dd>{visual.typography.weights || "—"}</dd></div>
          <div><dt>Licence</dt><dd>{visual.typography.licenceNote || "—"}</dd></div>
        </dl>
      </Sub>
      <Sub title="Imagery">
        {visual.imagery.style ? <p>{visual.imagery.style}</p> : <Empty />}
        <div className="two">
          <div><span className="small muted">Do</span><List items={visual.imagery.doList} /></div>
          <div><span className="small muted">Don&rsquo;t</span><List items={visual.imagery.dontList} /></div>
        </div>
        {visual.imagery.avoid.length > 0 && <p className="small muted">Keep out of frame: {visual.imagery.avoid.join(", ")}</p>}
      </Sub>
    </Section>
  );
}

export function ChannelsSection({ doc }: P) {
  const rows = doc.kit.channels.filter((c) => c.handle || c.bio || c.linkInBio || c.notes);
  return (
    <Section title="Channel presence">
      {rows.length ? (
        <table>
          <thead><tr><th>Network</th><th>Handle</th><th>Bio</th><th>Link in bio</th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.network}><td>{c.network}</td><td>{c.handle || "—"}</td><td>{c.bio || "—"}{c.notes ? <span className="small muted"><br />{c.notes}</span> : null}</td><td>{c.linkInBio ? <a href={c.linkInBio}>{c.linkInBio}</a> : "—"}</td></tr>)}</tbody>
        </table>
      ) : <Empty />}
    </Section>
  );
}

export function AssetsSection({ doc }: P) {
  const { links } = doc.kit.assets;
  return (
    <Section title="Brand assets">
      <Sub title="In the RocketEase library">
        {doc.assets.length ? <table><thead><tr><th>Asset</th><th>Size</th><th>Rights</th></tr></thead><tbody>{doc.assets.map((a, i) => <tr key={i}><td>{a.title}</td><td>{a.size ?? "—"}</td><td>{a.rights}</td></tr>)}</tbody></table> : <Empty />}
      </Sub>
      <Sub title="Kept elsewhere">{links.length ? <ul className="plain">{links.map((l, i) => <li key={i}>{l.label ? `${l.label}: ` : ""}<a href={l.url}>{l.url}</a></li>)}</ul> : <Empty />}</Sub>
    </Section>
  );
}

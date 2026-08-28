/* Service, paid, insights and the definitions appendix that makes the numbers checkable. */
import type { InboxRow, ReportAppendix, ReportDocument } from "../document";

function LabelledRows({ rows }: { rows: InboxRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Measure</th>
          <th className="num">Value</th>
          <th style={{ width: "50%" }}>How it is counted</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">{r.value}</td>
            <td className="muted">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ServiceSection({ doc }: { doc: ReportDocument }) {
  if (!doc.inbox) return null;
  return (
    <section>
      <h2>Conversations and response</h2>
      <p className="small muted">Service metrics for the shared inbox across every connected channel.</p>
      <LabelledRows rows={doc.inbox} />
    </section>
  );
}

export function PaidSectionView({ doc }: { doc: ReportDocument }) {
  if (!doc.paid) return null;
  const a = doc.paid.attribution;
  return (
    <section>
      <h2>Paid activity</h2>
      <p className="small muted">
        Attribution: {a.model}, {a.window}. Source: {a.sources}. Currency: {a.currency}.{a.freshLabel ? ` Last imported ${a.freshLabel}.` : ""}
      </p>
      <LabelledRows rows={doc.paid.rows} />
      <p className="note">Paid and organic results are reported side by side, never added together: the networks attribute them with different models and windows.</p>
    </section>
  );
}

export function InsightsSection({ doc }: { doc: ReportDocument }) {
  if (!doc.insights.length) return null;
  return (
    <section>
      <h2>What we suggest next</h2>
      <p className="small muted">Generated from this workspace&rsquo;s own stored facts; each one names the evidence behind it in the product.</p>
      <ul className="plain">
        {doc.insights.map((r, i) => (
          <li key={i}>
            <strong>{r.title}</strong> <span className="muted small">({r.confidence})</span>
            <br />
            <span className="muted">{r.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Appendix({ appendix }: { appendix: ReportAppendix }) {
  return (
    <section className="appendix">
      <h2>Definitions and data sources</h2>
      <p className="small muted">Metric contract version {appendix.definitionsVersion}. Last successful data refresh: {appendix.freshnessLabel}.</p>
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Metric</th>
            <th style={{ width: "38%" }}>Definition</th>
            <th>Formula</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {appendix.metrics.map((m) => (
            <tr key={m.name}>
              <td>{m.name}<br /><span className="muted small">{m.unit}</span></td>
              <td>{m.definition}</td>
              <td className="muted">{m.formula}</td>
              <td className="muted">{m.sources}<br /><span className="small">{m.freshness}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: 24 }}>Caveats</h3>
      <ul className="plain small">
        {appendix.caveats.map((c, i) => (<li key={i}>{c}</li>))}
        {appendix.metrics.filter((m) => m.caveat).map((m) => (<li key={m.name}><strong>{m.name}:</strong> {m.caveat}</li>))}
      </ul>
      {appendix.staleSources.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Sources needing attention</h3>
          <ul className="plain small">{appendix.staleSources.map((s, i) => (<li key={i}>{s}</li>))}</ul>
        </>
      )}
      {appendix.revisionNote && <p className="note">{appendix.revisionNote}</p>}
    </section>
  );
}

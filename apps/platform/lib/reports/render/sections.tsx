/* Performance sections of the branded report. Every figure arrives pre-formatted from build.ts. */
import React from "react"; // see index.tsx: the worker uses the classic JSX runtime
import type { ReportDocument } from "../document";
import { Legend, MixChart, TrendChart } from "./charts";
import { BrandRow } from "./shell";

type Doc = ReportDocument;

export function Cover({ doc }: { doc: Doc }) {
  const { meta, brand } = doc;
  const preparedBy = brand.usesClientBrand ? brand.clientName : brand.agencyName;
  return (
    <header className="cover">
      <BrandRow brand={brand} />
      <h1>{meta.title}</h1>
      <p className="muted">
        {brand.clientName} · {meta.periodLabel}
      </p>
      <dl className="metagrid">
        <div>
          <dt>Reporting period</dt>
          <dd>{meta.periodLabel}</dd>
        </div>
        <div>
          <dt>Compared with</dt>
          <dd>{meta.comparisonLabel ?? "No comparison"}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{meta.scopeLabel} · {meta.channelLabel}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>{meta.generatedAt} ({meta.timezone})</dd>
        </div>
      </dl>
      {preparedBy && <p className="small muted" style={{ marginTop: 16 }}>Prepared by {preparedBy}.</p>}
    </header>
  );
}

export function Scorecard({ doc }: { doc: Doc }) {
  return (
    <section>
      <h2>Headline results</h2>
      <p className="small muted">Each card carries the definition it was measured by. A dash means the source for that metric is not connected — it is never a zero.</p>
      <div className="cards" style={{ marginTop: 14 }}>
        {doc.scorecard.map((s) => (
          <div className="card" key={s.name}>
            <div className="k">{s.name}</div>
            <div className="v">{s.value}</div>
            <div className="d">{s.unavailable ? s.unavailable : s.previous ? `${s.deltaLabel ?? ""} vs ${s.previous} previously` : "No comparison period"}</div>
            <div className="def">{s.definition}<br />Formula: {s.formula}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Trend({ doc }: { doc: Doc }) {
  const networks = [...new Set(doc.trend.map((p) => p.network))];
  return (
    <section>
      <h2>{doc.trendMetric} over time</h2>
      <p className="small muted">Daily totals per network in {doc.meta.timezone}. Networks are shown separately because their definitions differ.</p>
      <TrendChart points={doc.trend} />
      <Legend networks={networks} />
    </section>
  );
}

export function ChannelMixSection({ doc }: { doc: Doc }) {
  if (!doc.mix.length) return null;
  return (
    <section>
      <h2>Where the engagement came from</h2>
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" }}>
        <MixChart slices={doc.mix} total={doc.mixTotal} />
        <table style={{ flex: "1 1 380px" }}>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Network</th>
              <th className="num">Engagement</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {doc.mix.map((m) => (
              <tr key={`${m.network}-${m.name}`}>
                <td>{m.name}</td>
                <td>{m.network}</td>
                <td className="num">{Math.round(m.value).toLocaleString()}</td>
                <td className="num">{m.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TopPosts({ doc }: { doc: Doc }) {
  if (!doc.topPosts.length) return null;
  return (
    <section>
      <h2>Top posts</h2>
      <p className="small muted">Ranked by engagement inside the period, from post-level facts.</p>
      <table>
        <thead>
          <tr>
            <th>Post</th>
            <th>Channel</th>
            <th>Published</th>
            <th className="num">Reach</th>
            <th className="num">Engagement</th>
            <th className="num">Link clicks</th>
          </tr>
        </thead>
        <tbody>
          {doc.topPosts.map((p, i) => (
            <tr key={i}>
              <td>{p.url ? <a href={p.url}>{p.title}</a> : p.title}</td>
              <td>{p.channelName}<br /><span className="muted small">{p.network}</span></td>
              <td>{p.publishedAt}</td>
              <td className="num">{p.reach}</td>
              <td className="num">{p.engagement}</td>
              <td className="num">{p.clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

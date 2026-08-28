/*
 * Agency roll-up body: one section per client workspace.
 * analytics.md forbids misleading combined totals across clients — there is
 * deliberately no "all clients" row, and spend stays inside its own workspace
 * section in that account's currency.
 */
import type { RollupClient, RollupDocument } from "../document";
import { BrandRow } from "./shell";

function RollupCover({ doc }: { doc: RollupDocument }) {
  return (
    <header className="cover">
      <BrandRow brand={doc.brand} />
      <h1>{doc.meta.title}</h1>
      <p className="muted">
        {doc.meta.periodLabel} · {doc.clients.length} client workspace{doc.clients.length === 1 ? "" : "s"}
      </p>
      <dl className="metagrid">
        <div>
          <dt>Scope</dt>
          <dd>{doc.meta.scopeLabel}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>{doc.meta.generatedAt}</dd>
        </div>
      </dl>
      <p className="note">
        Directional pulse per client. Figures are not combined across clients: reach is not deduplicated between networks and each account reports spend in its own currency, so a single total would be misleading.
      </p>
    </header>
  );
}

function ClientSection({ client }: { client: RollupClient }) {
  return (
    <section>
      <h2>{client.name}</h2>
      <p className="small muted">
        {client.periodLabel} · {client.timezone}
      </p>
      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Measure</th>
            <th className="num">Value</th>
            <th style={{ width: "48%" }}>How it is counted</th>
          </tr>
        </thead>
        <tbody>
          {client.rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{r.value}</td>
              <td className="muted">{r.note}</td>
            </tr>
          ))}
          {client.spend && (
            <tr>
              <td>Paid spend</td>
              <td className="num">{client.spend}</td>
              <td className="muted">In this ad account&rsquo;s own currency. Never converted or added to another client&rsquo;s spend.</td>
            </tr>
          )}
        </tbody>
      </table>
      {client.note && <p className="small muted" style={{ marginTop: 8 }}>{client.note}</p>}
    </section>
  );
}

export function RollupBody({ doc }: { doc: RollupDocument }) {
  return (
    <>
      <RollupCover doc={doc} />
      {doc.clients.map((c) => (<ClientSection key={c.name} client={c} />))}
      {doc.clients.length === 0 && <p className="muted">No client workspaces are available to you yet.</p>}
    </>
  );
}

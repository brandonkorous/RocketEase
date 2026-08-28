import type { ShareAccess } from "@/lib/reports/access";

type Ok = Extract<ShareAccess, { status: "ok" }>;

/** The branded wrapper a client sees: identity, freshness, download, then the document itself. */
export function ReportView({ token, share }: { token: string; share: Ok }) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-base-300 pb-5">
        <div>
          {share.brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={share.brand.logo} alt={share.brand.name} className="max-h-10" />
          ) : (
            <p className="text-sm font-semibold">{share.brand.name}</p>
          )}
          <h1 className="app-title mt-2">{share.runName}</h1>
          <p className="mt-1 text-sm text-secondary">
            Generated {share.generatedLabel} · link valid until {share.expiresLabel}
          </p>
        </div>
        <a href={`/r/${token}/download`} className="btn btn-outline btn-sm">
          Download {share.pdfKey ? "PDF" : share.format.toUpperCase()}
        </a>
      </header>
      <iframe src={`/r/${token}/view`} title={share.runName} className="mt-6 h-200 w-full rounded-box border border-base-300 bg-base-100" />
      {share.brand.footerText && <p className="mt-4 text-xs text-secondary/70">{share.brand.footerText}</p>}
    </>
  );
}
